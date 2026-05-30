import { Op, Transaction } from "sequelize";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";

/**
 * Atomically claim the next due `pending` scheduled job, if any.
 *
 * Runs inside the caller's transaction using `SELECT ... FOR UPDATE SKIP
 * LOCKED LIMIT 1`. Two consequences flow from that:
 *
 *   - Concurrent workers never claim the same row, and a row another worker
 *     is holding is skipped rather than blocked on.
 *   - The claim's effect (status flip to `processing`) is only visible after
 *     the caller commits. If the work performed in the same transaction
 *     rolls back, the claim disappears with it and the row stays `pending`,
 *     which means the orchestrator can record a clean `failed` status from a
 *     fresh transaction rather than fighting an in-flight `processing` row.
 *
 * Ordering: oldest-due first (`run_at ASC`), with `created_at ASC` as the
 * tiebreaker so two jobs scheduled for the same instant are claimed in
 * insertion order. This is the same key as the
 * `game_scheduled_jobs_status_run_at` index for efficient lookup.
 */
export async function claimDueJob(
  now: Date,
  transaction: Transaction,
): Promise<GameScheduledJob | null> {
  const candidates = await GameScheduledJob.findAll({
    where: {
      status: "pending",
      runAt: { [Op.lte]: now },
    },
    order: [
      ["runAt", "ASC"],
      ["createdAt", "ASC"],
    ],
    limit: 1,
    lock: Transaction.LOCK.UPDATE,
    skipLocked: true,
    transaction,
  });

  const job = candidates[0];
  if (!job) {
    return null;
  }

  job.status = "processing";
  await job.save({ transaction });
  return job;
}
