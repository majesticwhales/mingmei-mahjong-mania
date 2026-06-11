import type { Transaction } from "sequelize";
import {
  visibilityIncludes,
  type VisibilityMode,
} from "../game/visibility-mode.ts";
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
  /**
   * Per-slot map-reveal offsets (Phase L §3.13). Same shape rules as
   * `slotUnlockOffsetsSeconds` (length, slot-0 = 0) except elements may
   * be `null` (slot is never on the map; no job seeded). A
   * `SLOT_MAP_UNLOCKED` job is seeded for every slot `k >= 1` whose
   * offset is non-null, positive, AND differs from
   * `slotUnlockOffsetsSeconds[k]` — coincident timers dedupe to a
   * single `SLOT_UNLOCKED` job so the client doesn't see two events at
   * the same wall-clock instant for the same slot.
   */
  slotMapUnlockOffsetsSeconds: Array<number | null>;
  notifications: ScheduledNotificationInput[];
  /**
   * Snapshotted from `games.visibility_mode`. Gates the
   * `VISIBILITY_PHASE_ADVANCE` / `SLOT_UNLOCKED` / `SLOT_MAP_UNLOCKED`
   * job loops: phase-off games skip the advances, slot-off games skip
   * both unlock variants. GAME_END and NOTIFICATION jobs always seed.
   */
  visibilityMode: VisibilityMode;
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
 * - SLOT_MAP_UNLOCKED (Phase L §3.13): one job per slot `k` (1-indexed)
 *   where `slotMapUnlockOffsetsSeconds[k]` is non-null AND positive AND
 *   differs from `slotUnlockOffsetsSeconds[k]`. Coincident timers dedupe
 *   to a single `SLOT_UNLOCKED` job (the projection treats slot-unlock
 *   as also revealing on the map when the map offset matches). Null map
 *   offsets mean "never on the map" — no job seeded.
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
    slotMapUnlockOffsetsSeconds,
    notifications,
    visibilityMode,
  } = input;
  const phaseLayerActive = visibilityIncludes(visibilityMode, "phase");
  const slotLayerActive = visibilityIncludes(visibilityMode, "slot");
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
  if (slotMapUnlockOffsetsSeconds.length !== slotUnlockOffsetsSeconds.length) {
    throw new Error(
      `slotMapUnlockOffsetsSeconds length (${slotMapUnlockOffsetsSeconds.length}) must match slotUnlockOffsetsSeconds length (${slotUnlockOffsetsSeconds.length})`,
    );
  }
  if (slotMapUnlockOffsetsSeconds[0] !== 0) {
    throw new Error(
      `slotMapUnlockOffsetsSeconds[0] must be 0 (slot 0 is always immediately on the map); got ${slotMapUnlockOffsetsSeconds[0]}`,
    );
  }
  for (let k = 0; k < slotMapUnlockOffsetsSeconds.length; k += 1) {
    const offset = slotMapUnlockOffsetsSeconds[k];
    if (offset === null) continue;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(
        `slotMapUnlockOffsetsSeconds[${k}] must be a non-negative integer or null, got ${offset}`,
      );
    }
    const claim = slotUnlockOffsetsSeconds[k]!;
    if (offset < claim) {
      throw new Error(
        `slotMapUnlockOffsetsSeconds[${k}] (${offset}) must be >= slotUnlockOffsetsSeconds[${k}] (${claim})`,
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

  if (phaseLayerActive) {
    for (let k = 1; k < visibilityPhaseCount; k += 1) {
      jobs.push({
        gameId,
        jobType: "VISIBILITY_PHASE_ADVANCE",
        runAt: new Date(startedAtMs + intervalMs * k),
        status: "pending",
        payload: { targetPhase: k },
      });
    }
  }

  jobs.push({
    gameId,
    jobType: "GAME_END",
    runAt: endsAt,
    status: "pending",
    payload: null,
  });

  if (slotLayerActive) {
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
    // Phase L: SLOT_MAP_UNLOCKED jobs for slots whose map-reveal timer
    // differs from the claim timer. Skip null offsets (slot never on the
    // map) and zero offsets (slot starts on the map). Skip offsets that
    // coincide with the claim offset since the SLOT_UNLOCKED event
    // already covers the same wall-clock instant and surface.
    for (let k = 1; k < slotMapUnlockOffsetsSeconds.length; k += 1) {
      const offset = slotMapUnlockOffsetsSeconds[k];
      if (offset == null || offset === 0) continue;
      const claim = slotUnlockOffsetsSeconds[k]!;
      if (offset === claim) continue;
      jobs.push({
        gameId,
        jobType: "SLOT_MAP_UNLOCKED",
        runAt: new Date(startedAtMs + offset * 1000),
        status: "pending",
        payload: { slotIndex: k },
      });
    }
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
