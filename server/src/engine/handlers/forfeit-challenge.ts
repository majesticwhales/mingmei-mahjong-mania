import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameChallengeInstance } from "../../models/game-challenge-instance.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameNodeChallenge } from "../../models/game-node-challenge.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { challengeCooldownMsFromGame } from "../challenge-lifecycle.ts";
import { assertNotHandCompleted } from "../hand-completed-lock.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

interface ForfeitChallengePayload {
  /** `game_challenge_instances.id` of the team's currently in-progress challenge. */
  instanceId: string;
  /** Phase L: raw geolocation sample (warn+allow — see `recordCommandGeolocation`). */
  rawGeo: unknown;
}

function parsePayload(payload: Record<string, unknown>): ForfeitChallengePayload {
  const instanceId = payload.instanceId;
  if (typeof instanceId !== "string" || instanceId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CHALLENGE_FORFEITED requires a string instanceId in the payload",
    );
  }
  return { instanceId, rawGeo: payload.geo };
}

/**
 * Explicit forfeit of an in-progress challenge. Triggers the same 5-minute
 * cooldown as a completion but DOES NOT grant a swap credit; the team's
 * `pending_swap_credit` and `credit_earned_in_session` flags are
 * untouched. Implicit forfeits from check-in / check-out emit the same
 * event type with `reason: "checkout"` (see `challenge-lifecycle.ts`);
 * this handler emits `reason: "explicit"` to distinguish a player-driven
 * forfeit from an auto-forfeit in the event log.
 *
 * Pre-conditions: same as `complete-challenge.ts` except no check-in
 * requirement — a team can forfeit even if a race with auto-forfeit
 * already moved them off-station (defensive; in practice the orchestrator
 * holds a row lock so this is unreachable).
 */
export const forfeitChallengeHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { instanceId, rawGeo } = parsePayload(ctx.payload);

    await assertNotHandCompleted({
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });

    const instance = await GameChallengeInstance.findOne({
      where: { id: instanceId, gameId: ctx.gameId },
      include: [
        {
          model: GameNodeChallenge,
          required: true,
          include: [
            {
              model: GameNode,
              required: true,
              // Phase L expanded these from ["id", "code"] to include the
              // geofence columns so `recordCommandGeolocation` can
              // evaluate the team's sample against the station without
              // a second query.
              attributes: [
                "id",
                "code",
                "latitude",
                "longitude",
                "geofenceRadiusMeters",
              ],
            },
          ],
        },
      ],
      transaction: ctx.transaction,
    });
    if (!instance) {
      throw new HttpError(
        404,
        "not_found",
        `Challenge instance ${instanceId} not found in this game`,
      );
    }
    if (instance.gameTeamId !== ctx.gameTeamId) {
      throw new HttpError(
        403,
        "forbidden",
        "Challenge instance is owned by another team",
      );
    }
    if (instance.status !== "in_progress") {
      throw new HttpError(
        409,
        "challenge_not_in_progress",
        `Challenge instance is ${instance.status}, not in progress`,
      );
    }

    const node = instance.gameNodeChallenge!.gameNode!;

    // Phase L: capture telemetry. Unlike the other resolution handlers,
    // CHALLENGE_FORFEITED has no team-must-be-checked-in precondition
    // (the JSDoc above explains why), so the team may already be
    // off-station. We pass `currentStation: null` when that's the case
    // so the helper records `last_known_*` without firing a (misleading)
    // warning against the challenge's node. Position lookup is defensive
    // — every registered team has a row, but if the row is somehow
    // missing we still want the forfeit itself to succeed without
    // attempting a geo write.
    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    const currentStation =
      position?.currentGameNodeId === node.id ? node : null;
    const geoResult = position
      ? recordCommandGeolocation({
          rawGeo,
          position,
          currentStation,
        })
      : null;
    if (position && geoResult?.geo != null) {
      await position.save({ transaction: ctx.transaction });
    }

    const now = new Date();
    const cooldownUntil = new Date(
      now.getTime() + challengeCooldownMsFromGame(ctx.game),
    );

    instance.status = "failed";
    instance.resolvedAt = now;
    instance.cooldownUntil = cooldownUntil;
    instance.resolutionPayload = { reason: "explicit" };
    await instance.save({ transaction: ctx.transaction });

    const eventPayload: Record<string, unknown> = {
      nodeId: node.id,
      nodeCode: node.code,
      nodeName: node.name,
      challengeId: instance.challengeId,
      instanceId: instance.id,
      cooldownUntil: cooldownUntil.toISOString(),
      reason: "explicit",
    };
    if (geoResult?.geo != null) {
      eventPayload.geo = geoResult.geo;
      eventPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    return {
      events: [
        {
          eventType: "CHALLENGE_FORFEITED",
          payload: eventPayload,
        },
      ],
    };
  },
};
