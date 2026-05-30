import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Broadcaster,
  NotificationPayload,
} from "../../../src/engine/broadcaster.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { runSchedulerTick } from "../../../src/scheduler/run-tick.ts";
import type {
  SchedulerJobHandler,
  SchedulerJobHandlerRegistry,
} from "../../../src/scheduler/job-handler.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";

async function clearJobs(gameId: string): Promise<void> {
  await GameScheduledJob.destroy({ where: { gameId } });
}

async function insertJob(
  gameId: string,
  fields: {
    runAt: Date;
    jobType?: "VISIBILITY_PHASE_ADVANCE" | "GAME_END" | "NOTIFICATION";
    payload?: Record<string, unknown> | null;
  },
): Promise<GameScheduledJob> {
  return GameScheduledJob.create({
    gameId,
    jobType: fields.jobType ?? "GAME_END",
    runAt: fields.runAt,
    status: "pending",
    payload: fields.payload ?? null,
  });
}

type MockBroadcaster = {
  emitEvent: ReturnType<
    typeof vi.fn<(gameId: string, event: GameEvent) => void>
  >;
  emitState: ReturnType<typeof vi.fn<(gameId: string) => void>>;
  emitNotification: ReturnType<
    typeof vi.fn<(gameId: string, notification: NotificationPayload) => void>
  >;
} & Broadcaster;

function mockBroadcaster(): MockBroadcaster {
  return {
    emitEvent: vi.fn<(gameId: string, event: GameEvent) => void>(),
    emitState: vi.fn<(gameId: string) => void>(),
    emitNotification: vi.fn<
      (gameId: string, notification: NotificationPayload) => void
    >(),
  };
}

function registry(
  entries: Array<[
    "VISIBILITY_PHASE_ADVANCE" | "GAME_END" | "NOTIFICATION",
    SchedulerJobHandler,
  ]>,
): SchedulerJobHandlerRegistry {
  return new Map(entries);
}

describe("runSchedulerTick", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns zeros when no jobs are due", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);

    const result = await runSchedulerTick({
      now: new Date(),
      handlers: registry([]),
    });
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it("runs a successful job: appends event, marks done, broadcasts after commit", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const due = await insertJob(gameId, {
      runAt: new Date(Date.now() - 1000),
      jobType: "GAME_END",
    });

    const broadcaster = mockBroadcaster();
    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockResolvedValue({
        events: [
          { eventType: "GAME_ENDED", payload: { reason: "scheduled" } },
        ],
      }),
    };

    const result = await runSchedulerTick({
      now: new Date(),
      broadcaster,
      handlers: registry([["GAME_END", handler]]),
    });

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(handler.handle).toHaveBeenCalledTimes(1);

    const persisted = await GameScheduledJob.findByPk(due.id);
    expect(persisted?.status).toBe("done");
    expect(persisted?.completedAt).toBeInstanceOf(Date);
    expect(persisted?.errorMessage).toBeNull();

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("GAME_ENDED");
    expect(events[0]!.payload).toEqual({ reason: "scheduled" });
    expect(events[0]!.actorUserId).toBeNull();
    expect(events[0]!.actorGameTeamId).toBeNull();

    expect(broadcaster.emitEvent).toHaveBeenCalledTimes(1);
    expect(broadcaster.emitEvent).toHaveBeenCalledWith(
      gameId,
      expect.objectContaining({ eventType: "GAME_ENDED" }),
    );
    expect(broadcaster.emitState).toHaveBeenCalledWith(gameId);
    expect(broadcaster.emitNotification).not.toHaveBeenCalled();
  });

  it("invokes emitNotification for notifications returned by a handler", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await insertJob(gameId, {
      runAt: new Date(Date.now() - 1000),
      jobType: "NOTIFICATION",
      payload: { template: "time_warning", data: { minutesLeft: 10 } },
    });

    const broadcaster = mockBroadcaster();
    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockResolvedValue({
        events: [
          {
            eventType: "NOTIFICATION",
            payload: { template: "time_warning", data: { minutesLeft: 10 } },
          },
        ],
        notifications: [{ template: "time_warning", data: { minutesLeft: 10 } }],
      }),
    };

    const result = await runSchedulerTick({
      broadcaster,
      handlers: registry([["NOTIFICATION", handler]]),
    });

    expect(result.processed).toBe(1);
    expect(broadcaster.emitNotification).toHaveBeenCalledWith(gameId, {
      template: "time_warning",
      data: { minutesLeft: 10 },
    });
  });

  it("marks a job failed with the error message when its handler throws", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const due = await insertJob(gameId, {
      runAt: new Date(Date.now() - 1000),
      jobType: "GAME_END",
    });

    const broadcaster = mockBroadcaster();
    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockRejectedValue(new Error("boom")),
    };

    const result = await runSchedulerTick({
      broadcaster,
      handlers: registry([["GAME_END", handler]]),
    });

    expect(result).toEqual({ processed: 0, failed: 1 });
    const persisted = await GameScheduledJob.findByPk(due.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errorMessage).toBe("boom");
    expect(persisted?.completedAt).toBeInstanceOf(Date);

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(0);

    expect(broadcaster.emitEvent).not.toHaveBeenCalled();
    expect(broadcaster.emitState).not.toHaveBeenCalled();
    expect(broadcaster.emitNotification).not.toHaveBeenCalled();
  });

  it("marks a job failed when no handler is registered for its type", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const due = await insertJob(gameId, {
      runAt: new Date(Date.now() - 1000),
      jobType: "VISIBILITY_PHASE_ADVANCE",
    });

    const result = await runSchedulerTick({
      handlers: registry([]),
    });

    expect(result).toEqual({ processed: 0, failed: 1 });
    const persisted = await GameScheduledJob.findByPk(due.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errorMessage).toMatch(/VISIBILITY_PHASE_ADVANCE/);
  });

  it("processes multiple due jobs in run_at order within a single tick", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const past = Date.now() - 60 * 1000;
    const a = await insertJob(gameId, {
      runAt: new Date(past),
      jobType: "GAME_END",
      payload: { tag: "a" },
    });
    const b = await insertJob(gameId, {
      runAt: new Date(past + 1000),
      jobType: "GAME_END",
      payload: { tag: "b" },
    });
    const c = await insertJob(gameId, {
      runAt: new Date(past + 2000),
      jobType: "GAME_END",
      payload: { tag: "c" },
    });

    const seen: string[] = [];
    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockImplementation((ctx) => {
        seen.push((ctx.job.payload as { tag: string }).tag);
        return Promise.resolve({});
      }),
    };

    const result = await runSchedulerTick({
      handlers: registry([["GAME_END", handler]]),
    });

    expect(result).toEqual({ processed: 3, failed: 0 });
    expect(seen).toEqual(["a", "b", "c"]);
    for (const job of [a, b, c]) {
      const persisted = await GameScheduledJob.findByPk(job.id);
      expect(persisted?.status).toBe("done");
    }
  });

  it("respects maxJobsPerTick", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const past = Date.now() - 60 * 1000;
    for (let i = 0; i < 5; i += 1) {
      await insertJob(gameId, {
        runAt: new Date(past + i),
        jobType: "GAME_END",
      });
    }

    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockResolvedValue({}),
    };

    const result = await runSchedulerTick({
      maxJobsPerTick: 2,
      handlers: registry([["GAME_END", handler]]),
    });

    expect(result).toEqual({ processed: 2, failed: 0 });
    const remainingPending = await GameScheduledJob.count({
      where: { gameId, status: "pending" },
    });
    expect(remainingPending).toBe(3);
  });

  it("skips jobs whose run_at is still in the future", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const future = new Date(Date.now() + 60 * 1000);
    await insertJob(gameId, { runAt: future, jobType: "GAME_END" });

    const handler: SchedulerJobHandler = {
      handle: vi.fn().mockResolvedValue({}),
    };

    const result = await runSchedulerTick({
      now: new Date(),
      handlers: registry([["GAME_END", handler]]),
    });

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
