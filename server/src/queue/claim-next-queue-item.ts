import { Transaction } from "sequelize";
import { GameCommandQueueItem } from "../models/game-command-queue-item.ts";

/**
 * Atomically claim the oldest `pending` queue item for one game.
 *
 * Mirrors the scheduler's claim primitive: `SELECT ... FOR UPDATE SKIP
 * LOCKED LIMIT 1` inside the caller's transaction, so concurrent workers
 * never claim the same row and a row another worker is holding is skipped
 * rather than blocked on.
 *
 * Ordering: insertion order (`created_at ASC`), which matches the
 * `game_command_queue_game_status_created` index for cheap lookup.
 *
 * Per-game serialization: the skip-locked claim guarantees a row is only
 * processed once, but does not by itself enforce strict FIFO under
 * parallel workers for the same game. v1 runs one in-process worker per
 * game; multi-instance deployments will need a per-game advisory lock.
 */
export async function claimNextQueueItem(
  gameId: string,
  transaction: Transaction,
): Promise<GameCommandQueueItem | null> {
  const candidates = await GameCommandQueueItem.findAll({
    where: { gameId, status: "pending" },
    order: [["createdAt", "ASC"]],
    limit: 1,
    lock: Transaction.LOCK.UPDATE,
    skipLocked: true,
    transaction,
  });

  const item = candidates[0];
  if (!item) {
    return null;
  }

  item.status = "processing";
  await item.save({ transaction });
  return item;
}
