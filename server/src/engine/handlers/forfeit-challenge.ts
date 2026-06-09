import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameChallengeInstance } from "../../models/game-challenge-instance.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameNodeChallenge } from "../../models/game-node-challenge.ts";
import { CHALLENGE_COOLDOWN_MS } from "../challenge-lifecycle.ts";

interface ForfeitChallengePayload {
  /** `game_challenge_instances.id` of the team's currently in-progress challenge. */
  instanceId: string;
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
  return { instanceId };
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

    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + CHALLENGE_COOLDOWN_MS);

    instance.status = "failed";
    instance.resolvedAt = now;
    instance.cooldownUntil = cooldownUntil;
    instance.resolutionPayload = { reason: "explicit" };
    await instance.save({ transaction: ctx.transaction });

    return {
      events: [
        {
          eventType: "CHALLENGE_FORFEITED",
          payload: {
            nodeId: node.id,
            nodeCode: node.code,
            challengeId: instance.challengeId,
            instanceId: instance.id,
            cooldownUntil: cooldownUntil.toISOString(),
            reason: "explicit",
          },
        },
      ],
    };
  },
};
