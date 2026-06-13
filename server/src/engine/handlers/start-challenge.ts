import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameChallengeInstance } from "../../models/game-challenge-instance.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { assertNotHandCompleted } from "../hand-completed-lock.ts";
import { pickCurrentChallengeForTeam } from "../../services/challenge-queue.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

interface StartChallengePayload {
  /** Game node the team is starting the challenge at. Must match the team's current station. */
  nodeId: string;
  /** Phase L: raw geolocation sample (warn+allow — see `recordCommandGeolocation`). */
  rawGeo: unknown;
}

function parsePayload(payload: Record<string, unknown>): StartChallengePayload {
  const nodeId = payload.nodeId;
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "START_CHALLENGE requires a string nodeId in the payload",
    );
  }
  return { nodeId, rawGeo: payload.geo };
}

/**
 * Move the issuing team's relationship with their current challenge at
 * their current station from "available" to "in_progress" (TDD §3.8
 * state machine). The honor-system flow:
 *
 *   1. Team CHECK_IN at station S.
 *   2. Team clicks "Start" -> START_CHALLENGE -> instance row created.
 *   3. Team clicks "Complete" or "Forfeit" -> resolution event.
 *
 * "Current" is resolved by `pickCurrentChallengeForTeam`, which applies
 * the per-team cycle rule (`failed` / `in_progress` pin, `completed`
 * advance, wrap). The projection's `buildCurrentChallenge` uses the
 * same helper so the row the player sees in the UI is the row this
 * handler creates an instance against.
 *
 * Pre-conditions (in evaluation order):
 *   - team is checked in at `payload.nodeId` (`409 not_checked_in` /
 *     `409 wrong_node`).
 *   - `credit_earned_in_session === false` (`409 credit_already_used`).
 *   - team has no active `in_progress` instance anywhere
 *     (`409 challenge_in_progress`).
 *   - station has at least one challenge configured
 *     (`409 no_challenge_at_station`).
 *   - the team has no resolved instance at the station still under
 *     `cooldown_until` (`409 challenge_on_cooldown`). The gate is
 *     station-wide: a prior `completed` row keeps blocking even after
 *     the cycle has advanced to the next row.
 */
export const startChallengeHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { nodeId, rawGeo } = parsePayload(ctx.payload);

    await assertNotHandCompleted({
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position || position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team must be checked in at a station to start a challenge",
      );
    }
    if (position.currentGameNodeId !== nodeId) {
      throw new HttpError(
        409,
        "wrong_node",
        "nodeId does not match the team's current station",
      );
    }
    if (position.creditEarnedInSession) {
      throw new HttpError(
        409,
        "credit_already_used",
        "Team has already earned a swap credit during this check-in",
      );
    }

    const existingInProgress = await GameChallengeInstance.findOne({
      where: {
        gameId: ctx.gameId,
        gameTeamId: ctx.gameTeamId,
        status: "in_progress",
      },
      transaction: ctx.transaction,
    });
    if (existingInProgress) {
      throw new HttpError(
        409,
        "challenge_in_progress",
        "Team already has a challenge in progress",
      );
    }

    const node = await GameNode.findOne({
      where: { id: nodeId, gameId: ctx.gameId },
      transaction: ctx.transaction,
    });
    if (!node) {
      throw new HttpError(
        404,
        "node_not_in_game",
        `Station ${nodeId} is not on this game's map`,
      );
    }

    // Phase L: capture telemetry against the team's current station
    // (which equals `node` by the wrong_node check above). The helper
    // silently drops malformed input. We save the position below only
    // when a sample was actually recorded — START_CHALLENGE has no
    // other position mutation today.
    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: node,
    });
    if (geoResult.geo != null) {
      await position.save({ transaction: ctx.transaction });
    }

    const picked = await pickCurrentChallengeForTeam({
      gameNodeId: nodeId,
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });
    if (!picked) {
      throw new HttpError(
        409,
        "no_challenge_at_station",
        `Station ${node.code} has no challenges configured`,
      );
    }
    const topChallenge = picked.row;

    // Station-wide cooldown gate: `latestInstanceAtNode` is the team's
    // most-recent instance across the entire queue at this node, so a
    // prior `completed` resolution still blocks even after the cycle
    // advanced the picked row past it. `cooldown_until` is non-null
    // exactly when the row has resolved (`completed` / `failed`), so
    // `in_progress` (handled separately above) doesn't false-positive
    // this gate.
    const now = new Date();
    const cooldownUntil = picked.latestInstanceAtNode?.cooldownUntil ?? null;
    if (cooldownUntil != null && cooldownUntil.getTime() > now.getTime()) {
      throw new HttpError(
        409,
        "challenge_on_cooldown",
        `Challenge at ${node.code} is on cooldown until ${cooldownUntil.toISOString()}`,
      );
    }

    const instance = await GameChallengeInstance.create(
      {
        gameId: ctx.gameId,
        gameTeamId: ctx.gameTeamId,
        challengeId: topChallenge.challengeId,
        gameNodeChallengeId: topChallenge.id,
        status: "in_progress",
        assignedAt: now,
      },
      { transaction: ctx.transaction },
    );

    const eventPayload: Record<string, unknown> = {
      nodeId: node.id,
      nodeCode: node.code,
      nodeName: node.name,
      challengeId: topChallenge.challengeId,
      instanceId: instance.id,
    };
    if (geoResult.geo != null) {
      eventPayload.geo = geoResult.geo;
      eventPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    return {
      events: [
        {
          eventType: "START_CHALLENGE",
          payload: eventPayload,
        },
      ],
    };
  },
};
