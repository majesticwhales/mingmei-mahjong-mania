import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { lobbyRoom } from "../../../src/socket/rooms.ts";
import type { LobbyJoinAck } from "../../../src/socket/handlers/lobby.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import {
  connectAuthed,
  emitAck,
  startSocketTestServer,
  type SocketTestHarness,
} from "../../setup/socket.ts";

describe("socket lobby.join", () => {
  let harness: SocketTestHarness;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("returns the LobbyDetailDto and joins the lobby room for a member", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers({
      assignTeams: false,
    });
    const token = signAccessToken(hostId);
    const client = await connectAuthed(harness.url, { token });

    try {
      const response = await emitAck<LobbyJoinAck>(client, "lobby.join", {
        lobbyId,
      });
      expect(response.ok).toBe(true);
      if (!response.ok) throw new Error("expected ok response");
      expect(response.lobby.id).toBe(lobbyId);
      expect(response.lobby.hostUserId).toBe(hostId);
      expect(response.lobby.members).toHaveLength(4);

      const sockets = await harness.io.in(lobbyRoom(lobbyId)).fetchSockets();
      expect(sockets).toHaveLength(1);
      expect(sockets[0]!.data.userId).toBe(hostId);
    } finally {
      client.disconnect();
    }
  });

  it("rejects a non-member with forbidden and does not join the room", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const { user: outsider } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(outsider.id),
    });

    try {
      const response = await emitAck<LobbyJoinAck>(client, "lobby.join", {
        lobbyId,
      });
      expect(response).toMatchObject({ ok: false, code: "forbidden" });

      const sockets = await harness.io.in(lobbyRoom(lobbyId)).fetchSockets();
      expect(sockets).toHaveLength(0);
    } finally {
      client.disconnect();
    }
  });

  it("rejects an unknown lobbyId with not_found", async () => {
    const { user } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(user.id),
    });

    try {
      const response = await emitAck<LobbyJoinAck>(client, "lobby.join", {
        lobbyId: randomUUID(),
      });
      expect(response).toMatchObject({ ok: false, code: "not_found" });
    } finally {
      client.disconnect();
    }
  });

  it("rejects a missing lobbyId payload with invalid_payload", async () => {
    const { user } = await registerUser();
    const client = await connectAuthed(harness.url, {
      token: signAccessToken(user.id),
    });

    try {
      const response = await emitAck<LobbyJoinAck>(client, "lobby.join", {});
      expect(response).toMatchObject({ ok: false, code: "invalid_payload" });
    } finally {
      client.disconnect();
    }
  });

  it("multi-tab: two sockets for the same user each join the lobby room independently", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers({
      assignTeams: false,
    });
    const token = signAccessToken(hostId);
    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token }),
      connectAuthed(harness.url, { token }),
    ]);

    try {
      const [respA, respB] = await Promise.all([
        emitAck<LobbyJoinAck>(clientA, "lobby.join", { lobbyId }),
        emitAck<LobbyJoinAck>(clientB, "lobby.join", { lobbyId }),
      ]);
      expect(respA.ok).toBe(true);
      expect(respB.ok).toBe(true);

      const sockets = await harness.io.in(lobbyRoom(lobbyId)).fetchSockets();
      expect(sockets).toHaveLength(2);
      expect(sockets.every((s) => s.data.userId === hostId)).toBe(true);
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});
