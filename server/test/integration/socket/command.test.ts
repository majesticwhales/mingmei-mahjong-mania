import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { GameCommandQueueItem } from "../../../src/models/game-command-queue-item.ts";
import { type GameStateProjection } from "../../../src/projections/game-state.ts";
import { type RecentEventDto } from "../../../src/projections/recent-events.ts";
import { SocketBroadcaster } from "../../../src/socket/broadcaster.ts";
import {
  resetBroadcaster,
  setBroadcaster,
} from "../../../src/socket/broadcaster-registry.ts";
import type {
  GameCommandAcked,
  GameCommandPayload,
  GameCommandRejected,
  GameJoinAck,
} from "../../../src/socket/handlers/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import {
  connectAuthed,
  emitAck,
  startSocketTestServer,
  waitForEvent,
  type SocketTestHarness,
} from "../../setup/socket.ts";

describe("socket game.command", () => {
  let harness: SocketTestHarness;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
    setBroadcaster(new SocketBroadcaster(harness.io));
  });

  afterEach(async () => {
    resetBroadcaster();
    await harness.close();
  });

  it("happy CHECK_IN: issuer is acked and every team's sockets receive game.event + game.state", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 2,
      nodeCodes: ["a"],
    });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");
    const aId = fixture.nodeIdByCode.get("a")!;

    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token: signAccessToken(pA.userId) }),
      connectAuthed(harness.url, { token: signAccessToken(pB.userId) }),
    ]);

    try {
      await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);

      const clientCommandId = randomUUID();
      const ackPromise = waitForEvent<GameCommandAcked>(
        clientA,
        "game.command.acked",
      );
      const eventOnA = waitForEvent<RecentEventDto>(
        clientA,
        "game.event",
        (e) => e.type === "CHECK_IN",
      );
      const eventOnB = waitForEvent<RecentEventDto>(
        clientB,
        "game.event",
        (e) => e.type === "CHECK_IN",
      );
      const stateOnA = waitForEvent<GameStateProjection>(clientA, "game.state");
      const stateOnB = waitForEvent<GameStateProjection>(clientB, "game.state");

      const payload: GameCommandPayload = {
        gameId: fixture.gameId,
        gameTeamId: pA.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId,
      };
      clientA.emit("game.command", payload);

      const ack = await ackPromise;
      expect(ack.clientCommandId).toBe(clientCommandId);
      expect(typeof ack.queueItemId).toBe("string");

      const [evtA, evtB, projA, projB] = await Promise.all([
        eventOnA,
        eventOnB,
        stateOnA,
        stateOnB,
      ]);
      expect(evtA).toMatchObject({ type: "CHECK_IN", nodeCode: "a" });
      expect(evtB).toMatchObject({ type: "CHECK_IN", nodeCode: "a" });
      expect(projA.atStation).toMatchObject({ code: "a" });
      // Team B isn't at the station; their atStation stays null.
      expect(projB.atStation).toBeNull();

      const queueRow = await GameCommandQueueItem.findByPk(ack.queueItemId);
      expect(queueRow?.status).toBe("done");
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("rejects with forbidden when the issuer tries to act on a team they didn't join with", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 2,
      nodeCodes: ["a"],
    });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");

    const client = await connectAuthed(harness.url, {
      token: signAccessToken(pA.userId),
    });
    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const clientCommandId = randomUUID();
      const rejected = waitForEvent<GameCommandRejected>(
        client,
        "game.command.rejected",
      );
      client.emit("game.command", {
        gameId: fixture.gameId,
        gameTeamId: pB.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: fixture.nodeIdByCode.get("a")! },
        clientCommandId,
      });

      const reject = await rejected;
      expect(reject).toMatchObject({
        clientCommandId,
        code: "forbidden",
      });

      const queue = await GameCommandQueueItem.findAll({
        where: { gameId: fixture.gameId },
      });
      expect(queue).toHaveLength(0);
    } finally {
      client.disconnect();
    }
  });

  it("rejects with forbidden when the socket hasn't joined any game", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      const clientCommandId = randomUUID();
      const rejected = waitForEvent<GameCommandRejected>(
        client,
        "game.command.rejected",
      );
      client.emit("game.command", {
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: fixture.nodeIdByCode.get("a")! },
        clientCommandId,
      });

      const reject = await rejected;
      expect(reject).toMatchObject({ clientCommandId, code: "forbidden" });
    } finally {
      client.disconnect();
    }
  });

  it("rejects with client_command_id_conflict on a mismatched-payload duplicate", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a", "b"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const bId = fixture.nodeIdByCode.get("b")!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const clientCommandId = randomUUID();

      const firstAck = waitForEvent<GameCommandAcked>(
        client,
        "game.command.acked",
      );
      client.emit("game.command", {
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId,
      });
      await firstAck;

      const rejected = waitForEvent<GameCommandRejected>(
        client,
        "game.command.rejected",
      );
      client.emit("game.command", {
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: bId },
        clientCommandId,
      });

      const reject = await rejected;
      expect(reject).toMatchObject({
        clientCommandId,
        code: "client_command_id_conflict",
      });
    } finally {
      client.disconnect();
    }
  });

  it("idempotent retry: same clientCommandId + same payload acks twice without duplicating the queue row", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const clientCommandId = randomUUID();
      const command: GameCommandPayload = {
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId,
      };

      const ack1 = waitForEvent<GameCommandAcked>(client, "game.command.acked");
      client.emit("game.command", command);
      const first = await ack1;

      const ack2 = waitForEvent<GameCommandAcked>(client, "game.command.acked");
      client.emit("game.command", command);
      const second = await ack2;

      expect(second.queueItemId).toBe(first.queueItemId);
      const rows = await GameCommandQueueItem.findAll({
        where: { gameId: fixture.gameId, clientCommandId },
      });
      expect(rows).toHaveLength(1);
    } finally {
      client.disconnect();
    }
  });

  it("rejects with invalid_payload when required fields are missing, echoing back the clientCommandId when present", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });

      const clientCommandId = randomUUID();
      const rejected = waitForEvent<GameCommandRejected>(
        client,
        "game.command.rejected",
      );
      client.emit("game.command", {
        clientCommandId,
        gameId: fixture.gameId,
        // gameTeamId, commandType missing
      });

      const reject = await rejected;
      expect(reject.code).toBe("invalid_payload");
      expect(reject.clientCommandId).toBe(clientCommandId);
    } finally {
      client.disconnect();
    }
  });
});
