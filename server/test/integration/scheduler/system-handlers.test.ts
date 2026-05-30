import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Broadcaster,
  NotificationPayload,
} from "../../../src/engine/broadcaster.ts";
import { Game } from "../../../src/models/game.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import {
  GameScheduledJob,
  type ScheduledJobType,
} from "../../../src/models/game-scheduled-job.ts";
import { runSchedulerTick } from "../../../src/scheduler/run-tick.ts";
import { builtinSchedulerHandlers } from "../../../src/scheduler/handlers/index.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame, setupStartedGame } from "../../setup/game.ts";

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

async function clearJobs(gameId: string): Promise<void> {
  await GameScheduledJob.destroy({ where: { gameId } });
}

async function insertJob(
  gameId: string,
  jobType: ScheduledJobType,
  payload: Record<string, unknown> | null,
  options: { runAt?: Date } = {},
): Promise<GameScheduledJob> {
  return GameScheduledJob.create({
    gameId,
    jobType,
    runAt: options.runAt ?? new Date(Date.now() - 1000),
    status: "pending",
    payload,
  });
}

describe("VISIBILITY_PHASE_ADVANCE handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("advances visibility_phase, emits VISIBILITY_PHASE_ADVANCED, and broadcasts", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", { targetPhase: 1 });

    const broadcaster = mockBroadcaster();
    const result = await runSchedulerTick({ broadcaster });

    expect(result).toEqual({ processed: 1, failed: 0 });
    const game = await Game.findByPk(gameId);
    expect(game?.visibilityPhase).toBe(1);

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("VISIBILITY_PHASE_ADVANCED");
    expect(events[0]!.payload).toEqual({ previousPhase: 0, phase: 1 });
    expect(events[0]!.actorUserId).toBeNull();

    expect(broadcaster.emitEvent).toHaveBeenCalledTimes(1);
    expect(broadcaster.emitState).toHaveBeenCalledWith(gameId);
  });

  it("drains a 3-phase sequence in order", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const base = Date.now() - 60 * 1000;
    await insertJob(
      gameId,
      "VISIBILITY_PHASE_ADVANCE",
      { targetPhase: 1 },
      { runAt: new Date(base) },
    );
    await insertJob(
      gameId,
      "VISIBILITY_PHASE_ADVANCE",
      { targetPhase: 2 },
      { runAt: new Date(base + 1) },
    );
    await insertJob(
      gameId,
      "VISIBILITY_PHASE_ADVANCE",
      { targetPhase: 3 },
      { runAt: new Date(base + 2) },
    );

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 3, failed: 0 });

    const game = await Game.findByPk(gameId);
    expect(game?.visibilityPhase).toBe(3);

    const events = await GameEvent.findAll({
      where: { gameId, eventType: "VISIBILITY_PHASE_ADVANCED" },
      order: [["sequence", "ASC"]],
    });
    expect(events.map((e) => e.payload)).toEqual([
      { previousPhase: 0, phase: 1 },
      { previousPhase: 1, phase: 2 },
      { previousPhase: 2, phase: 3 },
    ]);
  });

  it("fails out-of-order advances loudly", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", {
      targetPhase: 2,
    });

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errorMessage).toMatch(/out of order/);

    const game = await Game.findByPk(gameId);
    expect(game?.visibilityPhase).toBe(0);
  });

  it("fails when targetPhase exceeds visibilityPhaseCount", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", {
      targetPhase: 4,
    });

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.errorMessage).toMatch(/out of range/);
  });

  it("fails when targetPhase is missing or non-integer", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const a = await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", {});
    const b = await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", {
      targetPhase: 1.5,
    });

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 0, failed: 2 });

    for (const job of [a, b]) {
      const persisted = await GameScheduledJob.findByPk(job.id);
      expect(persisted?.status).toBe("failed");
      expect(persisted?.errorMessage).toMatch(/targetPhase/);
    }
  });
});

describe("GAME_END handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("flips an active game to ended and emits GAME_ENDED", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await insertJob(gameId, "GAME_END", null);

    const broadcaster = mockBroadcaster();
    const now = new Date();
    const result = await runSchedulerTick({ broadcaster, now });

    expect(result).toEqual({ processed: 1, failed: 0 });
    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ended");

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("GAME_ENDED");
    expect(events[0]!.payload).toEqual({ endedAt: now.toISOString() });

    expect(broadcaster.emitEvent).toHaveBeenCalledWith(
      gameId,
      expect.objectContaining({ eventType: "GAME_ENDED" }),
    );
    expect(broadcaster.emitState).toHaveBeenCalledWith(gameId);
  });

  it("is idempotent on an already-ended game (no event, no failure)", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await Game.update({ status: "ended" }, { where: { id: gameId } });
    await insertJob(gameId, "GAME_END", null);

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 1, failed: 0 });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(0);
  });
});

describe("NOTIFICATION handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("emits a NOTIFICATION event and broadcasts emitNotification", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await insertJob(gameId, "NOTIFICATION", {
      template: "time_warning",
      data: { minutesLeft: 10 },
    });

    const broadcaster = mockBroadcaster();
    const result = await runSchedulerTick({ broadcaster });

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(broadcaster.emitNotification).toHaveBeenCalledWith(gameId, {
      template: "time_warning",
      data: { minutesLeft: 10 },
    });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("NOTIFICATION");
    expect(events[0]!.payload).toEqual({
      template: "time_warning",
      data: { minutesLeft: 10 },
    });
  });

  it("normalizes a missing data field to null in both event and broadcast", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    await insertJob(gameId, "NOTIFICATION", { template: "game_start" });

    const broadcaster = mockBroadcaster();
    await runSchedulerTick({ broadcaster });

    expect(broadcaster.emitNotification).toHaveBeenCalledWith(gameId, {
      template: "game_start",
    });
    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events[0]!.payload).toEqual({ template: "game_start", data: null });
  });

  it("fails when the template is missing", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "NOTIFICATION", { data: { x: 1 } });

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.errorMessage).toMatch(/template/);
  });

  it("fails when data is not an object or null", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "NOTIFICATION", {
      template: "x",
      data: [1, 2, 3],
    });

    const result = await runSchedulerTick({});
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.errorMessage).toMatch(/data/);
  });
});

describe("builtinSchedulerHandlers end-to-end", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("drains the full set of jobs scheduled at game start (3 advances + 1 end)", async () => {
    // Intentionally uses `setupStartedGame` because this test asserts the
    // 3 phase-advance + 1 game-end jobs that `startFromLobby` seeds.
    const { gameId } = await setupStartedGame();
    // The default lobby schedules every job in the future relative to startedAt;
    // pull them into the past so this tick can claim all four at once.
    await GameScheduledJob.update(
      { runAt: new Date(Date.now() - 60 * 1000) },
      { where: { gameId } },
    );

    const broadcaster = mockBroadcaster();
    const result = await runSchedulerTick({
      handlers: builtinSchedulerHandlers,
      broadcaster,
    });

    expect(result).toEqual({ processed: 4, failed: 0 });

    const game = await Game.findByPk(gameId);
    expect(game?.visibilityPhase).toBe(3);
    expect(game?.status).toBe("ended");

    const events = await GameEvent.findAll({
      where: { gameId },
      order: [["sequence", "ASC"]],
    });
    expect(events.map((e) => e.eventType)).toEqual([
      "VISIBILITY_PHASE_ADVANCED",
      "VISIBILITY_PHASE_ADVANCED",
      "VISIBILITY_PHASE_ADVANCED",
      "GAME_ENDED",
    ]);

    const pending = await GameScheduledJob.count({
      where: { gameId, status: "pending" },
    });
    expect(pending).toBe(0);
  });
});
