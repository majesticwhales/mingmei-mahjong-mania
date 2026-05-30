import type { Transaction } from "sequelize";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";

export interface ScheduledNotificationInput {
  /** Offset in seconds from `startedAt`. Must be `>= 0`. */
  atSeconds: number;
  /** Opaque template key. */
  template: string;
  /** Optional template-specific payload, persisted in the job's `payload.data`. */
  data: Record<string, unknown> | null;
}

/**
 * Seed `game_scheduled_jobs` for a freshly started game.
 *
 * - Visibility advances: schedule `(visibilityPhaseCount - 1)` jobs at
 *   `startedAt + intervalSeconds × k` for `k = 1 … N-1`. When
 *   `visibilityPhaseCount === 1`, no advance jobs are scheduled (phase 0
 *   already reveals the single group).
 * - GAME_END: one job at `endsAt`.
 * - NOTIFICATION: one job per entry in `notifications`, at
 *   `startedAt + atSeconds × 1000` with `payload = { template, data }`.
 */
export async function scheduleGameJobs(
  gameId: string,
  startedAt: Date,
  endsAt: Date,
  visibilityPhaseIntervalSeconds: number,
  visibilityPhaseCount: number,
  notifications: ScheduledNotificationInput[],
  transaction: Transaction,
): Promise<void> {
  if (!Number.isInteger(visibilityPhaseCount) || visibilityPhaseCount < 1) {
    throw new Error(
      `visibilityPhaseCount must be >= 1, got ${visibilityPhaseCount}`,
    );
  }

  const intervalMs = visibilityPhaseIntervalSeconds * 1000;
  const startedAtMs = startedAt.getTime();

  const jobs: Array<{
    gameId: string;
    jobType: "VISIBILITY_PHASE_ADVANCE" | "GAME_END" | "NOTIFICATION";
    runAt: Date;
    status: "pending";
    payload: Record<string, unknown> | null;
  }> = [];

  for (let k = 1; k < visibilityPhaseCount; k += 1) {
    jobs.push({
      gameId,
      jobType: "VISIBILITY_PHASE_ADVANCE",
      runAt: new Date(startedAtMs + intervalMs * k),
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

  for (const notification of notifications) {
    if (
      !Number.isInteger(notification.atSeconds) ||
      notification.atSeconds < 0
    ) {
      throw new Error(
        `notification.atSeconds must be a non-negative integer, got ${notification.atSeconds}`,
      );
    }
    jobs.push({
      gameId,
      jobType: "NOTIFICATION",
      runAt: new Date(startedAtMs + notification.atSeconds * 1000),
      status: "pending",
      payload: {
        template: notification.template,
        data: notification.data,
      },
    });
  }

  await GameScheduledJob.bulkCreate(jobs, { transaction });
}
