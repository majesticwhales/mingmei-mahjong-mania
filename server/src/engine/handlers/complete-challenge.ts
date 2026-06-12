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

interface CompleteChallengePayload {
  /** `game_challenge_instances.id` of the team's currently in-progress challenge. */
  instanceId: string;
  /** Phase L: raw geolocation sample (warn+allow — see `recordCommandGeolocation`). */
  rawGeo: unknown;
}

function parsePayload(payload: Record<string, unknown>): CompleteChallengePayload {
  const instanceId = payload.instanceId;
  if (typeof instanceId !== "string" || instanceId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CHALLENGE_COMPLETED requires a string instanceId in the payload",
    );
  }
  return { instanceId, rawGeo: payload.geo };
}

/**
 * Honor-system completion of an in-progress challenge. Grants the issuing
 * team a single-use swap credit (consumed by the next `SWAP_TILE` within
 * the same check-in session) and stamps a 5-minute cooldown so the team
 * cannot immediately re-attempt the same challenge.
 *
 * Pre-conditions (in evaluation order):
 *   - `instanceId` resolves to a row owned by this team and this game
 *     (`404 not_found` or `403 forbidden`).
 *   - row status is `in_progress` (`409 challenge_not_in_progress`).
 *   - team is still checked in at the same node the challenge was
 *     started at — defensive; auto-forfeit on check-out should already
 *     have killed the row (`409 not_checked_in` / `409 wrong_node`).
 *
 * Mutations:
 *   - `game_challenge_instances`: status='completed', resolved_at=now,
 *     cooldown_until=now+5min.
 *   - `game_team_positions`: pending_swap_credit=true,
 *     credit_earned_in_session=true.
 */
export const completeChallengeHandler: CommandHandler = {
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
              // evaluate the team's sample against the station without a
              // second query.
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

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position || position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team must remain checked in to complete a challenge",
      );
    }
    if (position.currentGameNodeId !== node.id) {
      throw new HttpError(
        409,
        "wrong_node",
        "Cannot complete a challenge from a different station",
      );
    }

    // Phase L: capture telemetry against the team's current station.
    // The helper silently drops malformed input. The position is already
    // saved below (existing credit mutation), so no extra save is
    // needed — last_known_* mutations ride along with that UPDATE.
    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: node,
    });

    const now = new Date();
    const cooldownUntil = new Date(
      now.getTime() + challengeCooldownMsFromGame(ctx.game),
    );

    instance.status = "completed";
    instance.resolvedAt = now;
    instance.cooldownUntil = cooldownUntil;
    instance.resolutionPayload = { reason: "completed" };
    await instance.save({ transaction: ctx.transaction });

    position.pendingSwapCredit = true;
    position.creditEarnedInSession = true;
    await position.save({ transaction: ctx.transaction });

    const eventPayload: Record<string, unknown> = {
      nodeId: node.id,
      nodeCode: node.code,
      nodeName: node.name,
      challengeId: instance.challengeId,
      instanceId: instance.id,
      cooldownUntil: cooldownUntil.toISOString(),
    };
    if (geoResult.geo != null) {
      eventPayload.geo = geoResult.geo;
      eventPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    return {
      events: [
        {
          eventType: "CHALLENGE_COMPLETED",
          payload: eventPayload,
        },
      ],
    };
  },
};
