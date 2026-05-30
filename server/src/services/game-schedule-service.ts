import type { Transaction } from "sequelize";
import {
  GameScheduledJob,
  type ScheduledJobType,
} from "../models/game-scheduled-job.ts";

export interface ScheduledNotificationInput {
  /** Offset in seconds from `startedAt`. Must be `>= 0`. */
  atSeconds: number;
  /** Opaque template key. */
  template: string;
  /** Optional template-specific payload, persisted in the job's `payload.data`. */
  data: Record<string, unknown> | null;
}

export interface ScheduleGameJobsInput {
  gameId: string;
  startedAt: Date;
  endsAt: Date;
  visibilityPhaseIntervalSeconds: number;
  visibilityPhaseCount: number;
  /**
   * Per-slot unlock offsets in seconds from `startedAt`. Length must be
   * `>= 1`. Entry `[0]` must be `0` (slot 0 is always unlocked at game
   * start, so no job is seeded for it). Each non-zero entry yields one
   * `SLOT_UNLOCKED` job at `startedAt + offsets[k] * 1000` with
   * `payload = { slotIndex: k }`.
   */
  slotUnlockOffsetsSeconds: number[];
  notifications: ScheduledNotificationInput[];
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
 * - SLOT_UNLOCKED: one job per slot `k` (1-indexed) where
 *   `slotUnlockOffsetsSeconds[k] > 0`, at `startedAt + offset * 1000` with
 *   `payload = { slotIndex: k }`. Slot 0 is always unlocked at start so
 *   no job is seeded for it. The CHECK on slot-0-is-always-0 is enforced
 *   by the lobby config flow (chunk 5).
 */
export async function scheduleGameJobs(
  input: ScheduleGameJobsInput,
  transaction: Transaction,
): Promise<void> {
  const {
    gameId,
    startedAt,
    endsAt,
    visibilityPhaseIntervalSeconds,
    visibilityPhaseCount,
    slotUnlockOffsetsSeconds,
    notifications,
  } = input;
  if (!Number.isInteger(visibilityPhaseCount) || visibilityPhaseCount < 1) {
    throw new Error(
      `visibilityPhaseCount must be >= 1, got ${visibilityPhaseCount}`,
    );
  }
  if (slotUnlockOffsetsSeconds.length < 1) {
    throw new Error(
      "slotUnlockOffsetsSeconds must have at least one entry (slot 0)",
    );
  }
  if (slotUnlockOffsetsSeconds[0] !== 0) {
    throw new Error(
      `slotUnlockOffsetsSeconds[0] must be 0 (slot 0 is always unlocked); got ${slotUnlockOffsetsSeconds[0]}`,
    );
  }
  for (let k = 0; k < slotUnlockOffsetsSeconds.length; k += 1) {
    const offset = slotUnlockOffsetsSeconds[k]!;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(
        `slotUnlockOffsetsSeconds[${k}] must be a non-negative integer, got ${offset}`,
      );
    }
  }

  const intervalMs = visibilityPhaseIntervalSeconds * 1000;
  const startedAtMs = startedAt.getTime();

  const jobs: Array<{
    gameId: string;
    jobType: ScheduledJobType;
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

  for (let k = 1; k < slotUnlockOffsetsSeconds.length; k += 1) {
    const offset = slotUnlockOffsetsSeconds[k]!;
    // A 0 offset means the slot is unlocked at game start, same as slot 0;
    // no SLOT_UNLOCKED event needed (the slot was never locked).
    if (offset === 0) continue;
    jobs.push({
      gameId,
      jobType: "SLOT_UNLOCKED",
      runAt: new Date(startedAtMs + offset * 1000),
      status: "pending",
      payload: { slotIndex: k },
    });
  }

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
