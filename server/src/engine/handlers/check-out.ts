import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { autoForfeitActiveChallenge } from "../challenge-lifecycle.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

/**
 * Check the issuing team out of its current station. Requires the team to be
 * checked in. Emits a CHECK_OUT event with the station they left.
 *
 * Phase L: an optional `geo` block on the payload is accepted and routed
 * through `recordCommandGeolocation`:
 *   - The team's `last_known_*` telemetry columns are updated (warn+allow:
 *     malformed `geo` is silently dropped).
 *   - Evaluation runs against the station the team is *leaving* (the
 *     current station). The resulting `geolocationWarning` is lifted onto
 *     the CHECK_OUT event payload. We deliberately evaluate against the
 *     leaving station here — for implicit CHECK_OUTs (triggered from
 *     CHECK_IN elsewhere) the parent CHECK_IN handler instead inherits the
 *     warning against the *new* station and emits the CHECK_OUT without a
 *     standalone evaluation. See `check-in.ts` for that path.
 *
 * The CHECK_IN-specific snapshot columns (`lastCheckInLatitude/Longitude`,
 * `geofenceValidated`, `geolocationWarning`) are still cleared so the next
 * SWAP_TILE can't reference stale coordinates from a station the team has
 * already left. The new `last_known_*` columns are *not* cleared — they're
 * cross-session telemetry by design.
 */
export const checkOutHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const rawGeo = ctx.payload.geo;

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

    if (position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team is not currently checked in at any station",
      );
    }

    const previousNodeId = position.currentGameNodeId;
    const previousNode = await GameNode.findOne({
      where: { id: previousNodeId, gameId: ctx.gameId },
      transaction: ctx.transaction,
    });

    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: previousNode,
    });

    // Phase H: explicit check-out auto-forfeits any in-progress
    // challenge — same rule as the implicit check-out path in
    // `check-in.ts`. Event ordering matches that handler: forfeit
    // first, then CHECK_OUT, so the log reads in causal order.
    const events: CommandResult["events"] = [];
    const forfeit = await autoForfeitActiveChallenge({
      transaction: ctx.transaction,
      gameId: ctx.gameId,
      gameTeamId: ctx.gameTeamId,
    });
    if (forfeit) {
      events.push(forfeit);
    }

    position.currentGameNodeId = null;
    position.checkedInAt = null;
    // Phase F: clear the most-recent-check-in geo snapshot so SWAP_TILE
    // (which inherits these values) can't reference stale coordinates from
    // a station the team has already left.
    position.lastCheckInLatitude = null;
    position.lastCheckInLongitude = null;
    position.geofenceValidated = null;
    position.geolocationWarning = null;
    // Phase H: end-of-session credit reset. Mirrors the unconditional
    // reset in `check-in.ts` so both paths produce identical "session
    // boundary" state.
    position.pendingSwapCredit = false;
    position.creditEarnedInSession = false;
    await position.save({ transaction: ctx.transaction });

    const checkOutPayload: Record<string, unknown> = {
      nodeId: previousNodeId,
      nodeCode: previousNode?.code ?? null,
      nodeName: previousNode?.name ?? null,
      implicit: false,
    };
    // Phase L: lift the raw sample + warning onto the event payload
    // (only when a sample was provided and parseable). `geolocationWarning`
    // is included as a boolean — false means "we checked and you were in
    // range", null/missing means "no sample was recorded".
    if (geoResult.geo != null) {
      checkOutPayload.geo = geoResult.geo;
      checkOutPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    events.push({
      eventType: "CHECK_OUT",
      payload: checkOutPayload,
    });

    return { events };
  },
};
