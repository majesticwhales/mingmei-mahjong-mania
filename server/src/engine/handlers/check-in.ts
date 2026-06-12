import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import {
  autoForfeitActiveChallenge,
  challengeCooldownMsFromGame,
} from "../challenge-lifecycle.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

interface CheckInPayload {
  nodeId: string;
  rawGeo: unknown;
}

function parsePayload(payload: Record<string, unknown>): CheckInPayload {
  const nodeId = payload.nodeId;
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CHECK_IN requires a string nodeId in the payload",
    );
  }
  // `geo` is extracted as `unknown` — the shared `recordCommandGeolocation`
  // helper validates it and silently drops malformed input (warn+allow per
  // TDD §3.12). Direct payload-shape errors here would defeat the
  // "geo never blocks a command" guarantee.
  return { nodeId, rawGeo: payload.geo };
}

/**
 * Check the issuing team in at a station.
 *
 * Per TDD §3.4 "Check-in elsewhere": if the team is already checked in at a
 * different station, the handler first emits an implicit CHECK_OUT event for
 * the previous station, then the CHECK_IN event for the new one. The single
 * underlying position update only writes the new node.
 *
 * Phase F + Phase L (this handler):
 *   - The optional `geo` payload is routed through the shared
 *     `recordCommandGeolocation` helper. The helper validates the input
 *     (warn+allow: malformed `geo` is silently dropped) and, on a valid
 *     sample, mutates the team's `last_known_*` telemetry columns +
 *     evaluates the geofence against the target station.
 *   - The CHECK_IN-specific snapshot columns (`lastCheckInLatitude`,
 *     `lastCheckInLongitude`, `geofenceValidated`, `geolocationWarning`)
 *     are written from the helper's result so they remain consistent with
 *     the new last-known columns.
 *   - The CHECK_IN event payload gains the raw `geo` block (Phase L)
 *     alongside the existing `geolocationWarning` / `geofenceValidated`
 *     / `distanceMeters` flags. The `geo` block is omitted when no sample
 *     was supplied or when the sample was malformed.
 *   - The implicit CHECK_OUT event emitted from inside this handler
 *     inherits the same `geo` block (so the audit trail captures where
 *     the team was at the moment of the move), but does NOT get its own
 *     `geolocationWarning` — the team is being validated against the
 *     *new* station, and double-emitting the warning against the *old*
 *     station would mislead the audit log. Per TDD §3.12 the helper is
 *     called exactly once per command submission.
 *
 * Phase G (deferred): media (photo) fields on the payload are still ignored.
 */
export const checkInHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { nodeId: targetNodeId, rawGeo } = parsePayload(ctx.payload);

    const targetNode = await GameNode.findOne({
      where: { id: targetNodeId, gameId: ctx.gameId },
      transaction: ctx.transaction,
    });
    if (!targetNode) {
      throw new HttpError(
        404,
        "node_not_in_game",
        `Station ${targetNodeId} is not on this game's map`,
      );
    }

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing position row for team ${ctx.gameTeamId}`,
      );
    }

    if (position.currentGameNodeId === targetNode.id) {
      throw new HttpError(
        409,
        "already_at_node",
        `Team is already checked in at ${targetNode.code}`,
      );
    }

    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: targetNode,
    });

    const events: CommandResult["events"] = [];

    // Phase H: stepping off the current station (implicit or explicit
    // check-out) auto-forfeits any in-progress challenge. We emit the
    // forfeit event before the CHECK_OUT/CHECK_IN events so the event log
    // reads "challenge failed because team moved" in causal order. The
    // helper is a no-op when nothing is in progress.
    if (position.currentGameNodeId != null) {
      const forfeit = await autoForfeitActiveChallenge({
        transaction: ctx.transaction,
        gameId: ctx.gameId,
        gameTeamId: ctx.gameTeamId,
        cooldownMs: challengeCooldownMsFromGame(ctx.game),
      });
      if (forfeit) {
        events.push(forfeit);
      }

      const previousNode = await GameNode.findOne({
        where: { id: position.currentGameNodeId, gameId: ctx.gameId },
        transaction: ctx.transaction,
      });
      const checkOutPayload: Record<string, unknown> = {
        nodeId: position.currentGameNodeId,
        nodeCode: previousNode?.code ?? null,
        nodeName: previousNode?.name ?? null,
        implicit: true,
      };
      // Phase L: lift the parent CHECK_IN's geo sample onto the implicit
      // CHECK_OUT event so the audit trail captures the team's position
      // at the moment of the move. Deliberately omit `geolocationWarning`
      // — the team is being validated against the *new* station, not the
      // old one, so re-emitting the warning here would mislead the log.
      if (geoResult.geo != null) {
        checkOutPayload.geo = geoResult.geo;
      }
      events.push({
        eventType: "CHECK_OUT",
        payload: checkOutPayload,
      });
    }

    position.currentGameNodeId = targetNode.id;
    position.checkedInAt = new Date();
    position.lastCheckInLatitude = geoResult.geo?.latitude ?? null;
    position.lastCheckInLongitude = geoResult.geo?.longitude ?? null;
    position.geofenceValidated = geoResult.geofenceValidated;
    position.geolocationWarning = geoResult.geolocationWarning;
    // Phase H: every CHECK_IN starts a fresh session. The swap-credit
    // flags reset unconditionally — even if the team hadn't earned a
    // credit, this normalizes the state and keeps the per-session
    // invariant single-source-of-truth in this handler.
    position.pendingSwapCredit = false;
    position.creditEarnedInSession = false;
    await position.save({ transaction: ctx.transaction });

    const checkInPayload: Record<string, unknown> = {
      nodeId: targetNode.id,
      nodeCode: targetNode.code,
      nodeName: targetNode.name,
    };
    if (geoResult.geo != null) {
      // Phase L: lift the raw sample onto the event payload (never
      // server-corrected) plus the existing Phase F warning flags. The
      // `geo` block is omitted entirely when no sample was supplied or
      // the sample was malformed — `geolocationWarning: false` would
      // wrongly suggest "we checked, and it was fine".
      checkInPayload.geo = geoResult.geo;
      checkInPayload.geolocationWarning = geoResult.geolocationWarning;
      checkInPayload.geofenceValidated = geoResult.geofenceValidated;
      checkInPayload.distanceMeters = geoResult.distanceMeters;
    }

    events.push({
      eventType: "CHECK_IN",
      payload: checkInPayload,
    });

    return { events };
  },
};
