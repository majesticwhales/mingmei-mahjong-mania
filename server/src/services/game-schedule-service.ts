import type { Transaction } from "sequelize";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";

/**
 * Seed `game_scheduled_jobs` for a freshly started game.
 *
 * - Visibility advances: schedule `(visibilityPhaseCount - 1)` jobs at
 *   `startedAt + intervalSeconds × k` for `k = 1 … N-1`. When
 *   `visibilityPhaseCount === 1`, no advance jobs are scheduled (phase 0
 *   already reveals the single group).
 * - GAME_END: one job at `endsAt`.
 *
 * NOTIFICATION jobs are seeded separately (chunk 6) once
 * `lobby_notifications` exists in the start path.
 */
export async function scheduleGameJobs(
  gameId: string,
  startedAt: Date,
  endsAt: Date,
  visibilityPhaseIntervalSeconds: number,
  visibilityPhaseCount: number,
  transaction: Transaction,
): Promise<void> {
  if (!Number.isInteger(visibilityPhaseCount) || visibilityPhaseCount < 1) {
    throw new Error(
      `visibilityPhaseCount must be >= 1, got ${visibilityPhaseCount}`,
    );
  }

  const intervalMs = visibilityPhaseIntervalSeconds * 1000;

  const jobs: Array<{
    gameId: string;
    jobType: "VISIBILITY_PHASE_ADVANCE" | "GAME_END";
    runAt: Date;
    status: "pending";
    payload: { targetPhase: number } | null;
  }> = [];

  for (let k = 1; k < visibilityPhaseCount; k += 1) {
    jobs.push({
      gameId,
      jobType: "VISIBILITY_PHASE_ADVANCE",
      runAt: new Date(startedAt.getTime() + intervalMs * k),
      status: "pending",
      payload: { targetPhase: k },
    });
  }

  jobs.push({
    gameId,
    jobType: "GAME_END",
    runAt: endsAt,
    status: "pending",
    payload: null,
  });

  await GameScheduledJob.bulkCreate(jobs, { transaction });
}
