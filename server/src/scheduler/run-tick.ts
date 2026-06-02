import { sequelize } from "../config/database.ts";
import type { Broadcaster } from "../engine/broadcaster.ts";
import { appendEvent } from "../engine/event-log.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";
import { claimDueJob } from "./claim-due-job.ts";
import { builtinSchedulerHandlers } from "./handlers/index.ts";
import type { SchedulerJobHandlerRegistry } from "./job-handler.ts";

export interface RunSchedulerTickOptions {
  /** Defaults to `new Date()` at call time. */
  now?: Date;
  /** Defaults to the process-wide broadcaster registry (Socket.IO-backed in production, no-op otherwise). */
  broadcaster?: Broadcaster;
  /** Defaults to {@link builtinSchedulerHandlers}. */
  handlers?: SchedulerJobHandlerRegistry;
  /**
   * Safety cap on jobs processed per tick. Prevents a runaway backlog from
   * monopolising the loop and starving other work. Default 100.
   */
  maxJobsPerTick?: number;
}

export interface SchedulerTickResult {
  /** Number of jobs that terminated with `status = 'done'`. */
  processed: number;
  /** Number of jobs that terminated with `status = 'failed'`. */
  failed: number;
}

interface ProcessOneResult {
  terminal: "done" | "failed";
  emit: () => Promise<void>;
}

/**
 * Drain all due `pending` scheduled jobs, up to `maxJobsPerTick`.
 *
 * For each job:
 *   1. Claim atomically (own transaction).
 *   2. Run the matching handler inside a second transaction. Events emitted
 *      by the handler are appended via {@link appendEvent} so sequence
 *      numbers come from the same allocator as command-originated events.
 *   3. On success, mark `done` and stage broadcasts; on failure, roll back
 *      the work transaction and record `failed` + `error_message` in a
 *      third transaction (so the failure is visible to operators even when
 *      the work itself rolled back).
 *
 * All broadcasts (`emitEvent`, `emitNotification`, `emitState`) fire after
 * every transaction has committed; consumers never see an event that was
 * later rolled back.
 */
export async function runSchedulerTick(
  options: RunSchedulerTickOptions = {},
): Promise<SchedulerTickResult> {
  const now = options.now ?? new Date();
  const broadcaster = options.broadcaster ?? getBroadcaster();
  const handlers = options.handlers ?? builtinSchedulerHandlers;
  const maxJobsPerTick = options.maxJobsPerTick ?? 100;

  let processed = 0;
  let failed = 0;
  const deferredEmits: Array<() => Promise<void>> = [];

  for (let i = 0; i < maxJobsPerTick; i += 1) {
    const outcome = await processOneJob(now, handlers, broadcaster);
    if (outcome == null) {
      break;
    }
    if (outcome.terminal === "done") {
      processed += 1;
    } else {
      failed += 1;
    }
    deferredEmits.push(outcome.emit);
  }

  for (const fn of deferredEmits) {
    await fn();
  }

  return { processed, failed };
}

async function processOneJob(
  now: Date,
  handlers: SchedulerJobHandlerRegistry,
  broadcaster: Broadcaster,
): Promise<ProcessOneResult | null> {
  const claimed = await sequelize.transaction((transaction) =>
    claimDueJob(now, transaction),
  );
  if (claimed == null) {
    return null;
  }

  const events: GameEvent[] = [];
  const notifications: Array<{ template: string; data?: Record<string, unknown> }> = [];

  try {
    await sequelize.transaction(async (transaction) => {
      const game = await Game.findByPk(claimed.gameId, { transaction });
      if (!game) {
        throw new Error(
          `Scheduled job ${claimed.id} references missing game ${claimed.gameId}`,
        );
      }

      const handler = handlers.get(claimed.jobType);
      if (!handler) {
        throw new Error(
          `No scheduler handler registered for job type: ${claimed.jobType}`,
        );
      }

      const outcome = await handler.handle({
        job: claimed,
        game,
        transaction,
        now,
      });

      for (const emitted of outcome.events ?? []) {
        const event = await appendEvent(transaction, {
          gameId: claimed.gameId,
          eventType: emitted.eventType,
          actorUserId: null,
          actorGameTeamId: null,
          payload: emitted.payload ?? {},
        });
        events.push(event);
      }
      for (const notification of outcome.notifications ?? []) {
        notifications.push(notification);
      }

      claimed.status = "done";
      claimed.completedAt = now;
      claimed.errorMessage = null;
      await claimed.save({ transaction });
    });

    return {
      terminal: "done",
      emit: async () => {
        for (const event of events) {
          await broadcaster.emitEvent(claimed.gameId, event);
        }
        for (const notification of notifications) {
          await broadcaster.emitNotification(claimed.gameId, notification);
        }
        await broadcaster.emitState(claimed.gameId);
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await GameScheduledJob.update(
      {
        status: "failed",
        completedAt: now,
        errorMessage,
      },
      { where: { id: claimed.id } },
    );
    return {
      terminal: "failed",
      emit: async () => {
        // Failed jobs are silent on the wire by design: no event was persisted
        // (the handler transaction rolled back), so there is nothing
        // commit-safe to broadcast.
      },
    };
  }
}
