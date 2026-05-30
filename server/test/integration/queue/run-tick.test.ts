import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Broadcaster,
  NotificationPayload,
} from "../../../src/engine/broadcaster.ts";
import { Game } from "../../../src/models/game.ts";
import { GameCommandQueueItem } from "../../../src/models/game-command-queue-item.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameTeamPosition } from "../../../src/models/game-team-position.ts";
import { enqueueCommand } from "../../../src/queue/enqueue-command.ts";
import { runQueueTickForGame } from "../../../src/queue/run-tick.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import {
  setupLightweightGame,
  type ParticipantFixture,
} from "../../setup/game.ts";

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

async function enqueueCheckIn(
  gameId: string,
  participant: ParticipantFixture,
  nodeCode: string,
): Promise<string> {
  const node = await GameNode.findOne({ where: { gameId, code: nodeCode } });
  if (!node) {
    throw new Error(`Test setup: no node ${nodeCode} on game ${gameId}`);
  }
  const result = await enqueueCommand({
    gameId,
    gameTeamId: participant.gameTeamId,
    userId: participant.userId,
    commandType: "CHECK_IN",
    payload: { nodeId: node.id },
    clientCommandId: randomUUID(),
  });
  return result.item.id;
}

describe("runQueueTickForGame", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns zeros when the queue is empty", async () => {
    const { gameId } = await setupLightweightGame({ participantCount: 0 });
    const result = await runQueueTickForGame(gameId);
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it("processes a pending CHECK_IN: appends event, terminates row, broadcasts", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const itemId = await enqueueCheckIn(fixture.gameId, participant, "bay");

    const broadcaster = mockBroadcaster();
    const result = await runQueueTickForGame(fixture.gameId, { broadcaster });

    expect(result).toEqual({ processed: 1, failed: 0 });

    const persisted = await GameCommandQueueItem.findByPk(itemId);
    expect(persisted?.status).toBe("done");
    expect(persisted?.processedAt).toBeInstanceOf(Date);
    expect(persisted?.errorMessage).toBeNull();

    const events = await GameEvent.findAll({
      where: { gameId: fixture.gameId },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("CHECK_IN");
    expect(events[0]!.actorUserId).toBe(participant.userId);
    expect(events[0]!.actorGameTeamId).toBe(participant.gameTeamId);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    const bay = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });
    expect(position?.currentGameNodeId).toBe(bay!.id);

    expect(broadcaster.emitEvent).toHaveBeenCalledTimes(1);
    expect(broadcaster.emitState).toHaveBeenCalledWith(fixture.gameId);
  });

  it("processes multiple pending items in FIFO order", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    await enqueueCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: {},
      clientCommandId: randomUUID(),
    });
    await enqueueCheckIn(fixture.gameId, participant, "bloor-yonge");

    const result = await runQueueTickForGame(fixture.gameId);

    expect(result).toEqual({ processed: 2, failed: 0 });
    const events = await GameEvent.findAll({
      where: { gameId: fixture.gameId },
      order: [["sequence", "ASC"]],
    });
    expect(events.map((e) => e.eventType)).toEqual(["CHECK_OUT", "CHECK_IN"]);

    const target = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bloor-yonge" },
    });
    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(target!.id);
  });

  it("marks a failing command as failed with the error message, without poisoning the queue", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;

    // First item: a CHECK_IN at a nodeId that does not belong to this game.
    const failing = await enqueueCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: randomUUID() },
      clientCommandId: randomUUID(),
    });
    // Second item: valid; should still run after the failure.
    const passingId = await enqueueCheckIn(fixture.gameId, participant, "bay");

    const broadcaster = mockBroadcaster();
    const result = await runQueueTickForGame(fixture.gameId, { broadcaster });

    expect(result).toEqual({ processed: 1, failed: 1 });

    const failed = await GameCommandQueueItem.findByPk(failing.item.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorMessage).toMatch(/not on this game/i);

    const passed = await GameCommandQueueItem.findByPk(passingId);
    expect(passed?.status).toBe("done");

    const events = await GameEvent.findAll({
      where: { gameId: fixture.gameId },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("CHECK_IN");

    // The failure produced no broadcast; only the successful command did.
    expect(broadcaster.emitEvent).toHaveBeenCalledTimes(1);
  });

  it("marks queued commands failed when the game is no longer active", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const itemId = await enqueueCheckIn(fixture.gameId, participant, "bay");
    await Game.update(
      { status: "ended" },
      { where: { id: fixture.gameId } },
    );

    const result = await runQueueTickForGame(fixture.gameId);
    expect(result).toEqual({ processed: 0, failed: 1 });

    const persisted = await GameCommandQueueItem.findByPk(itemId);
    expect(persisted?.status).toBe("failed");
    expect(persisted?.errorMessage).toMatch(/not accepted|game_not_active|ended/i);
  });

  it("respects maxItems", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    for (let i = 0; i < 3; i += 1) {
      await enqueueCheckIn(fixture.gameId, participant, "bay");
    }

    const result = await runQueueTickForGame(fixture.gameId, { maxItems: 1 });
    // Only one item ran; we don't care whether it succeeded or failed (the
    // first will succeed, subsequent CHECK_INs would fail with already_at_node).
    expect(result.processed + result.failed).toBe(1);

    const remaining = await GameCommandQueueItem.count({
      where: { gameId: fixture.gameId, status: "pending" },
    });
    expect(remaining).toBe(2);
  });

  it("does not pick up items from other games", async () => {
    const a = await setupLightweightGame({ participantCount: 0 });
    const b = await setupLightweightGame({ nodeCodes: ["bay"] });
    await enqueueCheckIn(b.gameId, b.participants[0]!, "bay");

    const result = await runQueueTickForGame(a.gameId);
    expect(result).toEqual({ processed: 0, failed: 0 });

    const bPending = await GameCommandQueueItem.count({
      where: { gameId: b.gameId, status: "pending" },
    });
    expect(bPending).toBe(1);
  });
});
