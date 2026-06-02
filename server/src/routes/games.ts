import { Router } from "express";
import { HttpError } from "../lib/http-error.ts";
import { asyncHandler } from "../middleware/async-handler.ts";
import { enqueueCommand } from "../queue/enqueue-command.ts";
import { triggerGameQueue } from "../queue/worker.ts";

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
