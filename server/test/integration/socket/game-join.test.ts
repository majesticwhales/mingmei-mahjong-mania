import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import type { GameJoinAck } from "../../../src/socket/handlers/game.ts";
import { gameRoom } from "../../../src/socket/rooms.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import {
  connectAuthed,
  emitAck,
  startSocketTestServer,
  type SocketTestHarness,
} from "../../setup/socket.ts";

describe("socket game.join", () => {
  let harness: SocketTestHarness;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("returns the initial team-scoped projection and joins the game room", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
      startNodeCodeBySlot: { 1: "a" },
      handTilesBySlot: { 1: 3 },
      nodeTilesByCode: { a: 1 },
    });
    const participant = fixture.participants[0]!;
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(participant.userId),
    });

    try {
      const response = await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });
      expect(response.ok).toBe(true);
      if (!response.ok) throw new Error("expected ok response");

      expect(response.state.gameId).toBe(fixture.gameId);
      expect(response.state.status).toBe("active");
      expect(response.state.handTiles).toHaveLength(3);
      expect(response.state.atStation).toMatchObject({ code: "a" });
      expect(response.state.mapNodes.map((n) => n.code)).toContain("a");

      const sockets = await harness.io
        .in(gameRoom(fixture.gameId))
        .fetchSockets();
      expect(sockets).toHaveLength(1);
      expect(sockets[0]!.data.userId).toBe(participant.userId);
      expect(sockets[0]!.data.gameTeamId).toBe(participant.gameTeamId);
      expect(sockets[0]!.data.gameId).toBe(fixture.gameId);
    } finally {
      client.disconnect();
    }
  });

  it("rejects a non-participant with forbidden and does not join the room", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const { user: outsider } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(outsider.id),
    });

    try {
      const response = await emitAck<GameJoinAck>(client, "game.join", {
        gameId: fixture.gameId,
      });
      expect(response).toMatchObject({ ok: false, code: "forbidden" });

      const sockets = await harness.io
        .in(gameRoom(fixture.gameId))
        .fetchSockets();
      expect(sockets).toHaveLength(0);
    } finally {
      client.disconnect();
    }
  });

  it("rejects an unknown gameId with forbidden (no enumeration channel)", async () => {
    const { user } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(user.id),
    });

    try {
      const response = await emitAck<GameJoinAck>(client, "game.join", {
        gameId: randomUUID(),
      });
      expect(response).toMatchObject({ ok: false, code: "forbidden" });
    } finally {
      client.disconnect();
    }
  });

  it("rejects a missing gameId payload with invalid_payload", async () => {
    const { user } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(user.id),
    });

    try {
      const response = await emitAck<GameJoinAck>(client, "game.join", {});
      expect(response).toMatchObject({ ok: false, code: "invalid_payload" });
    } finally {
      client.disconnect();
    }
  });

  it("delivers team-scoped projections: two participants on different teams see different state", async () => {
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
      const [respA, respB] = await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);
      if (!respA.ok || !respB.ok) {
        throw new Error("expected both ack responses to be ok");
      }
      expect(respA.state.handTiles).toHaveLength(2);
      expect(respB.state.handTiles).toHaveLength(5);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });

  it("multi-tab: same user opens two sockets, each independently joins the game room", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token }),
      connectAuthed(harness.url, { token }),
    ]);

    try {
      const [respA, respB] = await Promise.all([
        emitAck<GameJoinAck>(clientA, "game.join", { gameId: fixture.gameId }),
        emitAck<GameJoinAck>(clientB, "game.join", { gameId: fixture.gameId }),
      ]);
      expect(respA.ok).toBe(true);
      expect(respB.ok).toBe(true);

      const sockets = await harness.io
        .in(gameRoom(fixture.gameId))
        .fetchSockets();
      expect(sockets).toHaveLength(2);
      expect(
        sockets.every(
          (s) =>
            s.data.gameTeamId === participant.gameTeamId &&
            s.data.userId === participant.userId,
        ),
      ).toBe(true);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});
