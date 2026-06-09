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
import { GameTeam } from "../../../src/models/game-team.ts";
import { runSchedulerTick } from "../../../src/scheduler/run-tick.ts";
import { builtinSchedulerHandlers } from "../../../src/scheduler/handlers/index.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { setupLightweightGame, setupStartedGame } from "../../setup/game.ts";

type MockBroadcaster = {
  emitEvent: ReturnType<
    typeof vi.fn<(gameId: string, event: GameEvent) => void>
  >;
  emitState: ReturnType<typeof vi.fn<(gameId: string) => void>>;
  emitNotification: ReturnType<
    typeof vi.fn<(gameId: string, notification: NotificationPayload) => void>
  >;
  emitLobbyConfig: ReturnType<typeof vi.fn<(lobbyId: string) => void>>;
} & Broadcaster;

function mockBroadcaster(): MockBroadcaster {
  return {
    emitEvent: vi.fn<(gameId: string, event: GameEvent) => void>(),
    emitState: vi.fn<(gameId: string) => void>(),
    emitNotification: vi.fn<
      (gameId: string, notification: NotificationPayload) => void
    >(),
    emitLobbyConfig: vi.fn<(lobbyId: string) => void>(),
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

  it("upserts face-up visibility rows for the newly unlocked group", async () => {
    const { gameId, participants } = await setupStartedGame();
    const gameTeamId = participants[0]!.gameTeamId;
    await clearJobs(gameId);

    const countFaceUp = () =>
      GameLocationTeamVisibility.count({
        where: { gameTeamId, isFaceUp: true },
      });

    const phase0Count = await countFaceUp();
    expect(phase0Count).toBe(21);

    await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", { targetPhase: 1 });
    await runSchedulerTick({});
    expect(await countFaceUp()).toBe(42);

    await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", { targetPhase: 2 });
    await runSchedulerTick({});
    expect(await countFaceUp()).toBe(63);

    await insertJob(gameId, "VISIBILITY_PHASE_ADVANCE", { targetPhase: 3 });
    await runSchedulerTick({});
    expect(await countFaceUp()).toBe(84);
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

  it("flips an active game to ended, stamps noten teams, and emits GAME_ENDED with timer reason", async () => {
    const { gameId, gameTeamIdBySlot } = await setupLightweightGame({
      participantCount: 0,
    });
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
    expect(events[0]!.payload).toEqual({
      endedAt: now.toISOString(),
      endReason: "timer",
      winningGameTeamId: null,
    });

    // All four teams get final_* = 0 stamped; hand_completed_at stays NULL.
    for (const teamId of gameTeamIdBySlot.values()) {
      const team = await GameTeam.findByPk(teamId);
      expect(team?.handCompletedAt).toBeNull();
      expect(team?.finalHan).toBe(0);
      expect(team?.finalFu).toBe(0);
      expect(team?.finalPoints).toBe(0);
      expect(team?.finalYakuKeys).toBeNull();
    }

    expect(broadcaster.emitEvent).toHaveBeenCalledWith(
      gameId,
      expect.objectContaining({ eventType: "GAME_ENDED" }),
    );
    expect(broadcaster.emitState).toHaveBeenCalledWith(gameId);
  });

  it("emits all_teams_completed + the strict winner when every team has a snapshot", async () => {
    const { gameId, gameTeamIdBySlot } = await setupLightweightGame({
      participantCount: 0,
      nodeCodes: ["x"],
      handTilesBySlot: { 1: 1, 2: 1, 3: 1, 4: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 3000 },
        { slot: 2, finalPoints: 8000 },
        { slot: 3, finalPoints: 4000 },
        { slot: 4, finalPoints: 5000 },
      ],
    });
    await clearJobs(gameId);
    await insertJob(gameId, "GAME_END", null);

    const broadcaster = mockBroadcaster();
    const now = new Date();
    const result = await runSchedulerTick({ broadcaster, now });
    expect(result).toEqual({ processed: 1, failed: 0 });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({
      endedAt: now.toISOString(),
      endReason: "all_teams_completed",
      winningGameTeamId: gameTeamIdBySlot.get(2)!,
    });
  });

  it("returns winningGameTeamId=null when two teams tie for top points", async () => {
    const { gameId } = await setupLightweightGame({
      participantCount: 0,
      nodeCodes: ["x"],
      handTilesBySlot: { 1: 1, 2: 1, 3: 1, 4: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 5000 },
        { slot: 2, finalPoints: 5000 },
        { slot: 3, finalPoints: 3000 },
        { slot: 4, finalPoints: 2000 },
      ],
    });
    await clearJobs(gameId);
    await insertJob(gameId, "GAME_END", null);

    const broadcaster = mockBroadcaster();
    const result = await runSchedulerTick({ broadcaster });
    expect(result).toEqual({ processed: 1, failed: 0 });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect((events[0]!.payload as { endReason: string }).endReason).toBe(
      "all_teams_completed",
    );
    expect(
      (events[0]!.payload as { winningGameTeamId: string | null }).winningGameTeamId,
    ).toBeNull();
  });

  it("mixed-completion path: 1 completed + 3 noten -> timer end, winner = the lone completed team", async () => {
    const { gameId, gameTeamIdBySlot } = await setupLightweightGame({
      participantCount: 0,
      nodeCodes: ["x"],
      handTilesBySlot: { 3: 1 },
      markTeamHandCompleted: [
        {
          slot: 3,
          finalHan: 4,
          finalFu: 30,
          finalPoints: 7700,
          finalYakuKeys: [
            { name: "Tanyao", han: 1 },
            { name: "Sanshoku", han: 2 },
          ],
        },
      ],
    });
    await clearJobs(gameId);
    await insertJob(gameId, "GAME_END", null);

    const broadcaster = mockBroadcaster();
    const now = new Date();
    const result = await runSchedulerTick({ broadcaster, now });
    expect(result).toEqual({ processed: 1, failed: 0 });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events[0]!.payload).toEqual({
      endedAt: now.toISOString(),
      endReason: "timer",
      winningGameTeamId: gameTeamIdBySlot.get(3)!,
    });

    // The three noten teams get final_* = 0; the winner keeps its snapshot.
    for (const [slot, teamId] of gameTeamIdBySlot.entries()) {
      const team = await GameTeam.findByPk(teamId);
      if (slot === 3) {
        expect(team?.finalPoints).toBe(7700);
        expect(team?.finalYakuKeys).toEqual([
          { name: "Tanyao", han: 1 },
          { name: "Sanshoku", han: 2 },
        ]);
        expect(team?.handCompletedAt).toBeInstanceOf(Date);
      } else {
        expect(team?.finalPoints).toBe(0);
        expect(team?.finalYakuKeys).toBeNull();
        expect(team?.handCompletedAt).toBeNull();
      }
    }
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

describe("SLOT_UNLOCKED handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("emits a SLOT_UNLOCKED event with the slotIndex payload and broadcasts state", async () => {
    const { gameId } = await setupLightweightGame({
      participantCount: 0,
      slotsPerNode: 3,
      slotUnlockOffsetsSeconds: [0, 60, 120],
    });
    await clearJobs(gameId);
    await insertJob(gameId, "SLOT_UNLOCKED", { slotIndex: 1 });

    const broadcaster = mockBroadcaster();
    const result = await runSchedulerTick({
      handlers: builtinSchedulerHandlers,
      broadcaster,
    });

    expect(result).toEqual({ processed: 1, failed: 0 });

    const events = await GameEvent.findAll({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("SLOT_UNLOCKED");
    expect(events[0]!.payload).toEqual({ slotIndex: 1 });
    expect(events[0]!.actorUserId).toBeNull();
    expect(events[0]!.actorGameTeamId).toBeNull();

    expect(broadcaster.emitState).toHaveBeenCalledWith(gameId);
  });

  it("fails when slotIndex is 0 (slot 0 is never scheduled)", async () => {
    const { gameId } = await setupLightweightGame({
      participantCount: 0,
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 60],
    });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "SLOT_UNLOCKED", { slotIndex: 0 });

    const result = await runSchedulerTick({
      handlers: builtinSchedulerHandlers,
    });
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errorMessage).toMatch(/slotIndex/);
  });

  it("fails when slotIndex >= slotsPerNode", async () => {
    const { gameId } = await setupLightweightGame({
      participantCount: 0,
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 60],
    });
    await clearJobs(gameId);
    const job = await insertJob(gameId, "SLOT_UNLOCKED", { slotIndex: 5 });

    const result = await runSchedulerTick({
      handlers: builtinSchedulerHandlers,
    });
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameScheduledJob.findByPk(job.id);
    expect(persisted?.errorMessage).toMatch(/out of range/);
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
