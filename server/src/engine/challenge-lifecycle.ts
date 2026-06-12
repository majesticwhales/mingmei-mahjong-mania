import type { Transaction } from "sequelize";
import type { EmittedEvent } from "./process-command.ts";
import { GameChallengeInstance } from "../models/game-challenge-instance.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";

/**
 * Per-(team, challenge) cooldown after either an honor-system completion
 * or a forfeit. While `cooldown_until > now()`, `START_CHALLENGE` against
 * that same node challenge rejects with `409 challenge_on_cooldown`.
 *
 * Five minutes per product spec; bump if product wants a longer floor.
 * Tunable per-challenge cooldowns would live on `challenges.parameters`
 * (or a new column) in a future iteration.
 */
export const CHALLENGE_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Auto-forfeit any in-progress challenge instance owned by the issuing
 * team within the given game. Used by `CHECK_IN` (implicit check-out
 * branch) and `CHECK_OUT` so a team cannot "carry" an active challenge
 * across stations: stepping off the station they started on counts as a
 * failed attempt and triggers the standard 5-minute cooldown.
 *
 * Returns the `CHALLENGE_FORFEITED` event to emit, or `null` when the
 * team has no in-progress instance. The caller appends the event to its
 * own `events` array; `processCommand` stamps `actorUserId` /
 * `actorGameTeamId` on top.
 *
 * Idempotent: a team can only ever have a single `in_progress` row at a
 * time (enforced by the `START_CHALLENGE` handler), so this can be
 * called unconditionally without worrying about a "many active rows"
 * failure mode.
 */
export async function autoForfeitActiveChallenge(args: {
  transaction: Transaction;
  gameId: string;
  gameTeamId: string;
  now?: Date;
}): Promise<EmittedEvent | null> {
  const active = await GameChallengeInstance.findOne({
    where: {
      gameId: args.gameId,
      gameTeamId: args.gameTeamId,
      status: "in_progress",
    },
    include: [
      {
        model: GameNodeChallenge,
        required: true,
        include: [
          {
            model: GameNode,
            required: true,
            attributes: ["id", "code", "name"],
          },
        ],
      },
    ],
    transaction: args.transaction,
  });

  if (!active) return null;

  const node = active.gameNodeChallenge?.gameNode;
  if (!node) {
    // The include is `required: true`, so this branch is unreachable
    // in practice — but fail loud rather than emit a half-formed event.
    return null;
  }

  const now = args.now ?? new Date();
  const cooldownUntil = new Date(now.getTime() + CHALLENGE_COOLDOWN_MS);

  active.status = "failed";
  active.resolvedAt = now;
  active.cooldownUntil = cooldownUntil;
  active.resolutionPayload = { reason: "checkout" };
  await active.save({ transaction: args.transaction });

  return {
    eventType: "CHALLENGE_FORFEITED",
    payload: {
      nodeId: node.id,
      nodeCode: node.code,
      nodeName: node.name,
      challengeId: active.challengeId,
      instanceId: active.id,
      cooldownUntil: cooldownUntil.toISOString(),
      reason: "checkout",
    },
  };
}
