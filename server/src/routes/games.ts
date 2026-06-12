import { Router } from "express";
import { HttpError } from "../lib/http-error.ts";
import { asyncHandler } from "../middleware/async-handler.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { enqueueCommand } from "../queue/enqueue-command.ts";
import { triggerGameQueue } from "../queue/worker.ts";
import { buildGameSummary } from "../services/game-summary-service.ts";
import { endGameEarly } from "../services/game-end-service.ts";
import { buildNodeView } from "../services/node-view.ts";

export const gamesRouter = Router();

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-empty string`,
    );
  }
  return value;
}

function parseOptionalRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be an object when present`,
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Submit a player command over HTTP. Mirrors the `game.command` socket
 * event so a client whose websocket is currently down (subway tunnel,
 * iOS Safari backgrounding the tab, flaky cell handoff) can still send
 * commands and have the same idempotency / authz guarantees apply.
 *
 * Wire shape:
 *   - Body: `{ gameTeamId, commandType, payload?, clientCommandId }`.
 *     `gameId` is taken from the URL only; including it in the body is
 *     not required and silently ignored if present.
 *   - 202 Accepted on success with `{ clientCommandId, queueItemId }`.
 *     The command is durably enqueued at this point; the actual state
 *     mutation happens asynchronously in the worker. Clients that also
 *     hold a socket connection will see `game.event` / `game.state`
 *     when processing finishes; pure-HTTP callers can re-join the
 *     socket later (or extend this surface with a `GET state` poll
 *     endpoint — not built in v1).
 *   - 4xx errors from `enqueueCommand` (`game_not_active`, `forbidden`,
 *     `unknown_command`, `client_command_id_conflict`, validation
 *     errors) flow through the standard `errorHandler` middleware so
 *     the response shape matches the rest of the REST API.
 *
 * After the row is committed we fire `triggerGameQueue(gameId)` — fire-
 * and-forget, exactly as the socket handler does — so an HTTP-only
 * client doesn't have to wait for the safety-net poll to drain the
 * row. Idempotent retries on a `duplicate` insert do the same trigger;
 * the worker's coalescing guarantees this is cheap.
 */
gamesRouter.post(
  "/:id/end",
  asyncHandler(async (req, res) => {
    const result = await endGameEarly(req.params.id, req.user!.id);
    res.json(result);
  }),
);

gamesRouter.post(
  "/:id/commands",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const gameId = req.params.id;
    const result = await enqueueCommand({
      gameId,
      gameTeamId: parseRequiredString(body.gameTeamId, "gameTeamId"),
      userId: req.user!.id,
      commandType: parseRequiredString(body.commandType, "commandType"),
      payload: parseOptionalRecord(body.payload, "payload"),
      clientCommandId: parseRequiredString(body.clientCommandId, "clientCommandId"),
    });
    triggerGameQueue(gameId);
    res.status(202).json({
      clientCommandId: result.item.clientCommandId,
      queueItemId: result.item.id,
    });
  }),
);

/**
 * Phase J — end-of-game scoreboard (TDD §3.10, §7).
 *
 * Returns the full per-team summary DTO after `games.status = 'ended'`:
 * 14-tile hands for teams that ran `CLAIM_WIN`, 13-tile hands +
 * `analyzeHand` wait sets for tenpai noten teams, plus the `endReason`
 * / `winningGameTeamId` snapshot taken at `GAME_ENDED` time. Authz:
 * the user must be a `game_participants` row for this game; otherwise
 * `403 forbidden` — same shape as `enqueueCommand`'s authz check so
 * "game does not exist" and "you aren't a participant" return
 * identical responses (no enumeration channel).
 *
 * Game-not-ended is a separate `409 game_not_ended` so the client can
 * distinguish "wait, the game is still in progress" from a permanent
 * 404. The endpoint never re-runs scoring for completed teams — the
 * snapshot stamped at `CLAIM_WIN` time is authoritative.
 */
gamesRouter.get(
  "/:id/summary",
  asyncHandler(async (req, res) => {
    const gameId = req.params.id;
    const participant = await GameParticipant.findOne({
      where: { gameId, userId: req.user!.id },
    });
    if (!participant) {
      throw new HttpError(
        403,
        "forbidden",
        "Not a participant of this game",
      );
    }
    const summary = await buildGameSummary(gameId);
    res.status(200).json(summary);
  }),
);

/**
 * Phase L §3.14 — per-team node view (TDD).
 *
 * Returns the StationPanel-ready view of a single map node from the
 * requesting team's perspective: the exhaustive per-slot `tiles[]`
 * (same shape as `mapNodes[].tiles[]` on the socket projection, with
 * the at-station privilege applied when the requester is checked in
 * here — see [§6.3](TDD)), the current challenge surface, and an
 * `availableActions[]` matrix with stable disable-reason codes the UI
 * can render verbatim.
 *
 * Authz: identical guard to `GET /:id/summary` — the user must own a
 * `game_participants` row for this game. A non-participant gets a 403
 * `forbidden` (same response shape as a missing game, so no
 * enumeration channel). The team identifier passed to `buildNodeView`
 * is the participant row's `game_team_id`, so the view always reflects
 * *the requester's* team — there's no `?teamId=` knob.
 *
 * Service-level errors flow through unchanged:
 *  - `404 game_not_found` — the gameId isn't in the DB.
 *  - `404 node_not_found` — the nodeId isn't on this game's map.
 *  - `404 team_not_in_game` — defence in depth; should be caught by
 *    the 403 above before it gets to the service.
 *  - `409 game_ended` — read-only views remain available; this fires
 *    only on `games.status === 'ended'` so the client knows to switch
 *    to the summary surface.
 */
gamesRouter.get(
  "/:id/nodes/:nodeId/view",
  asyncHandler(async (req, res) => {
    const gameId = req.params.id;
    const nodeId = req.params.nodeId;
    const participant = await GameParticipant.findOne({
      where: { gameId, userId: req.user!.id },
    });
    if (!participant) {
      throw new HttpError(
        403,
        "forbidden",
        "Not a participant of this game",
      );
    }
    const view = await buildNodeView({
      gameId,
      gameTeamId: participant.gameTeamId,
      nodeId,
    });
    res.status(200).json(view);
  }),
);
