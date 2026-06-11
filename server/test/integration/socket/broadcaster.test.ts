import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { appendEvent } from "../../../src/engine/event-log.ts";
import { processCommand } from "../../../src/engine/process-command.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { type GameStateProjection } from "../../../src/projections/game-state.ts";
import { type RecentEventDto } from "../../../src/projections/recent-events.ts";
import { SocketBroadcaster } from "../../../src/socket/broadcaster.ts";
import {
  resetBroadcaster,
  setBroadcaster,
} from "../../../src/socket/broadcaster-registry.ts";
import type { GameJoinAck } from "../../../src/socket/handlers/game.ts";
import { runSchedulerTick } from "../../../src/scheduler/run-tick.ts";
import {
  getSequelize,
  truncateMutableTables,
} from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import {
  connectAuthed,
  emitAck,
  startSocketTestServer,
  waitForEvent,
  type SocketTestHarness,
} from "../../setup/socket.ts";

describe("SocketBroadcaster", () => {
  let harness: SocketTestHarness;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
  });

  afterEach(async () => {
    resetBroadcaster();
    await harness.close();
  });

  it("emitEvent: fans the serialized DTO out to every socket in the game room", async () => {
    const fixture = await setupLightweightGame({ participantCount: 2 });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");

    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token: signAccessToken(pA.userId) }),
      connectAuthed(harness.url, { token: signAccessToken(pB.userId) }),
    ]);

    try {
      await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);

      const sequelize = await getSequelize();
      const persisted = await sequelize.transaction((tx) =>
        appendEvent(tx, {
          gameId: fixture.gameId,
          eventType: "CHECK_IN",
          actorUserId: pA.userId,
          actorGameTeamId: pA.gameTeamId,
          payload: { nodeCode: "a", hasPhoto: false },
        }),
      );

      const broadcaster = new SocketBroadcaster(harness.io);

      const eventOnA = waitForEvent<RecentEventDto>(clientA, "game.event");
      const eventOnB = waitForEvent<RecentEventDto>(clientB, "game.event");
      await broadcaster.emitEvent(fixture.gameId, persisted);
      const [dtoA, dtoB] = await Promise.all([eventOnA, eventOnB]);

      expect(dtoA).toEqual(dtoB);
      expect(dtoA).toMatchObject({
        sequence: 1,
        type: "CHECK_IN",
        nodeCode: "a",
        hasPhoto: false,
      });
      expect(dtoA.teamCode).not.toBeNull();
      expect(typeof dtoA.at).toBe("string");
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("emitNotification: fans the template payload out to every socket in the game room", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const broadcaster = new SocketBroadcaster(harness.io);
      const received = waitForEvent<{
        template: string;
        data?: Record<string, unknown>;
      }>(client, "game.notification");
      broadcaster.emitNotification(fixture.gameId, {
        template: "halftime",
        data: { remainingSeconds: 1800 },
      });

      const payload = await received;
      expect(payload).toEqual({
        template: "halftime",
        data: { remainingSeconds: 1800 },
      });
    } finally {
      client.disconnect();
    }
  });

  it("emitState: builds and delivers a team-scoped projection to each team's sockets", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 2,
      handTilesBySlot: { 1: 2, 2: 5 },
    });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");

    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token: signAccessToken(pA.userId) }),
      connectAuthed(harness.url, { token: signAccessToken(pB.userId) }),
    ]);

    try {
      await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);

      const broadcaster = new SocketBroadcaster(harness.io);
      const stateA = waitForEvent<GameStateProjection>(clientA, "game.state");
      const stateB = waitForEvent<GameStateProjection>(clientB, "game.state");
      await broadcaster.emitState(fixture.gameId);
      const [projA, projB] = await Promise.all([stateA, stateB]);

      expect(projA.gameId).toBe(fixture.gameId);
      expect(projA.handTiles).toHaveLength(2);
      expect(projB.handTiles).toHaveLength(5);
      const aIds = new Set(projA.handTiles.map((t) => t.instanceId));
      const bIds = new Set(projB.handTiles.map((t) => t.instanceId));
      for (const id of aIds) expect(bIds.has(id)).toBe(false);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("emitState: fog gating differs between two teams looking at the same node", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 2,
      nodeCodes: ["a"],
      nodeTilesByCode: { a: 1 },
    });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");

    const aId = fixture.nodeIdByCode.get("a")!;
    await GameLocationTeamVisibility.create({
      gameTeamId: pA.gameTeamId,
      gameNodeId: aId,
      isFaceUp: true,
      source: "phase",
      revealedAt: new Date(),
    });

    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token: signAccessToken(pA.userId) }),
      connectAuthed(harness.url, { token: signAccessToken(pB.userId) }),
    ]);

    try {
      await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);

      const broadcaster = new SocketBroadcaster(harness.io);
      const stateA = waitForEvent<GameStateProjection>(clientA, "game.state");
      const stateB = waitForEvent<GameStateProjection>(clientB, "game.state");
      await broadcaster.emitState(fixture.gameId);
      const [projA, projB] = await Promise.all([stateA, stateB]);

      const aNodeA = projA.mapNodes.find((n) => n.code === "a")!;
      const aNodeB = projB.mapNodes.find((n) => n.code === "a")!;
      // Phase L Chunk 3 reshape: MapNodeDto.tiles is exhaustive per slot
      // with { tile: TileDto | null, visible, locked }. Team A's face-up
      // phase visibility reveals the seeded tile (non-null + visible);
      // team B sees the same slot fog-gated (null + invisible).
      expect(aNodeA.tiles).toHaveLength(1);
      expect(aNodeA.tiles[0]!.tile).not.toBeNull();
      expect(aNodeA.tiles[0]!.visible).toBe(true);
      expect(aNodeB.tiles).toHaveLength(1);
      expect(aNodeB.tiles[0]!.tile).toBeNull();
      expect(aNodeB.tiles[0]!.visible).toBe(false);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("emitState: silently no-ops when no sockets are in the game room", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const broadcaster = new SocketBroadcaster(harness.io);
    await expect(broadcaster.emitState(fixture.gameId)).resolves.toBeUndefined();
  });

  it("registry: processCommand uses the SocketBroadcaster set via setBroadcaster", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    setBroadcaster(new SocketBroadcaster(harness.io));
    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const eventPromise = waitForEvent<RecentEventDto>(
        client,
        "game.event",
        (e) => e.type === "CHECK_IN",
      );
      const statePromise = waitForEvent<GameStateProjection>(
        client,
        "game.state",
      );

      await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
      });

      const [event, state] = await Promise.all([eventPromise, statePromise]);
      expect(event).toMatchObject({ type: "CHECK_IN", nodeCode: "a" });
      expect(state.atStation).toMatchObject({ code: "a" });
    } finally {
      client.disconnect();
    }
  });

  it("scheduler integration: SLOT_UNLOCKED job fires game.event then game.state with the unlocked slot in atStation.tiles[]", async () => {
    // Both slots unlocked at start so `atStation.tiles[]` reliably
    // contains slot 1 once the team has joined. The point of this test
    // is the broadcaster fan-out path, not the wall-clock unlock check
    // (covered by the projection tests in chunk 1).
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
      startNodeCodeBySlot: { 1: "a" },
      nodeTilesByCode: { a: 2 },
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 0],
    });
    const participant = fixture.participants[0]!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      await GameScheduledJob.create({
        gameId: fixture.gameId,
        jobType: "SLOT_UNLOCKED",
        runAt: new Date(Date.now() - 1000),
        status: "pending",
        payload: { slotIndex: 1 },
      });

      const broadcaster = new SocketBroadcaster(harness.io);
      const eventPromise = waitForEvent<RecentEventDto>(
        client,
        "game.event",
        (e) => e.type === "SLOT_UNLOCKED",
      );
      const statePromise = waitForEvent<GameStateProjection>(
        client,
        "game.state",
      );

      const result = await runSchedulerTick({ broadcaster });
      expect(result.processed).toBe(1);

      const [event, state] = await Promise.all([eventPromise, statePromise]);
      expect(event).toMatchObject({ type: "SLOT_UNLOCKED", slotIndex: 1 });
      expect(state.atStation).not.toBeNull();
      const slotsInStation = state.atStation?.tiles?.map((e) => e.slotIndex);
      expect(slotsInStation).toEqual([0, 1]);
    } finally {
      client.disconnect();
    }
  });
});
