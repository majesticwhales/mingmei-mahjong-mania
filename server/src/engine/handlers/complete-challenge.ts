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
import { CHALLENGE_COOLDOWN_MS } from "../challenge-lifecycle.ts";

interface CompleteChallengePayload {
  /** `game_challenge_instances.id` of the team's currently in-progress challenge. */
  instanceId: string;
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
  return { instanceId };
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
    const { instanceId } = parsePayload(ctx.payload);

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
              attributes: ["id", "code"],
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

    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + CHALLENGE_COOLDOWN_MS);

    instance.status = "completed";
    instance.resolvedAt = now;
    instance.cooldownUntil = cooldownUntil;
    instance.resolutionPayload = { reason: "completed" };
    await instance.save({ transaction: ctx.transaction });

    position.pendingSwapCredit = true;
    position.creditEarnedInSession = true;
    await position.save({ transaction: ctx.transaction });

    return {
      events: [
        {
          eventType: "CHALLENGE_COMPLETED",
          payload: {
            nodeId: node.id,
            nodeCode: node.code,
            challengeId: instance.challengeId,
            instanceId: instance.id,
            cooldownUntil: cooldownUntil.toISOString(),
          },
        },
      ],
    };
  },
};
