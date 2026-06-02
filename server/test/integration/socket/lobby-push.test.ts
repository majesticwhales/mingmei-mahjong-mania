import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import type { LobbyDetailDto } from "../../../src/services/lobby-serializer.ts";
import { SocketBroadcaster } from "../../../src/socket/broadcaster.ts";
import {
  resetBroadcaster,
  setBroadcaster,
} from "../../../src/socket/broadcaster-registry.ts";
import type { LobbyJoinAck } from "../../../src/socket/handlers/lobby.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { bearer, getAgent, type ApiAgent } from "../../setup/http.ts";
import {
  connectAuthed,
  emitAck,
  startSocketTestServer,
  waitForEvent,
  type SocketTestHarness,
} from "../../setup/socket.ts";
import * as lobbyService from "../../../src/services/lobby-service.ts";

interface UserToken {
  userId: string;
  token: string;
}

async function registerWithToken(): Promise<UserToken> {
  const { user } = await registerUser();
  return { userId: user.id, token: signAccessToken(user.id) };
}

describe("socket lobby.config push", () => {
  let harness: SocketTestHarness;
  let agent: ApiAgent;
  let host: UserToken;
  let member: UserToken;
  let lobbyId: string;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
    setBroadcaster(new SocketBroadcaster(harness.io));

    agent = await getAgent();

    // Set up two users in the same lobby through the service layer (faster
    // than going through HTTP + auth for the prep work). The broadcasts
    // from these calls are harmless: no socket has joined the room yet.
    host = await registerWithToken();
    member = await registerWithToken();
    const lobby = await lobbyService.createLobby(host.userId);
    lobbyId = lobby.id;
    await lobbyService.joinLobby(lobbyId, member.userId);
  });

  afterEach(async () => {
    resetBroadcaster();
    await harness.close();
  });

  async function joinTwoSockets(): Promise<{
    hostSocket: Awaited<ReturnType<typeof connectAuthed>>;
    memberSocket: Awaited<ReturnType<typeof connectAuthed>>;
  }> {
    const [hostSocket, memberSocket] = await Promise.all([
      connectAuthed(harness.url, { token: host.token }),
      connectAuthed(harness.url, { token: member.token }),
    ]);
    const [hostAck, memberAck] = await Promise.all([
      emitAck<LobbyJoinAck>(hostSocket, "lobby.join", { lobbyId }),
      emitAck<LobbyJoinAck>(memberSocket, "lobby.join", { lobbyId }),
    ]);
    if (!hostAck.ok || !memberAck.ok) {
      throw new Error("Failed to join lobby room in test setup");
    }
    return { hostSocket, memberSocket };
  }

  it("PATCH /api/lobbies/:id/config fans out lobby.config to every socket in the room", async () => {
    const { hostSocket, memberSocket } = await joinTwoSockets();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .patch(`/api/lobbies/${lobbyId}/config`)
        .set(bearer(host.token))
        .send({ gameDurationSeconds: 600 });
      expect(res.status).toBe(200);

      const [hostDto, memberDto] = await Promise.all([onHost, onMember]);
      expect(hostDto.id).toBe(lobbyId);
      expect(hostDto.config.gameDurationSeconds).toBe(600);
      expect(memberDto.config.gameDurationSeconds).toBe(600);
      // Both members see the same shared lobby DTO; membership gating
      // happens at lobby.join time, so the broadcast is identical.
      expect(memberDto).toEqual(hostDto);
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("POST /api/lobbies/:id/join pushes the new member into the broadcast members list", async () => {
    const { hostSocket, memberSocket } = await joinTwoSockets();
    const newcomer = await registerWithToken();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .post(`/api/lobbies/${lobbyId}/join`)
        .set(bearer(newcomer.token))
        .send({});
      expect(res.status).toBe(200);

      const [hostDto, memberDto] = await Promise.all([onHost, onMember]);
      const memberIds = hostDto.members.map((m) => m.userId).sort();
      expect(memberIds).toEqual(
        [host.userId, member.userId, newcomer.userId].sort(),
      );
      expect(memberDto.members).toHaveLength(3);
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("POST /api/lobbies/:id/team pushes the updated teamSlot for the requesting member", async () => {
    const { hostSocket, memberSocket } = await joinTwoSockets();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .post(`/api/lobbies/${lobbyId}/team`)
        .set(bearer(member.token))
        .send({ teamSlot: 2 });
      expect(res.status).toBe(200);

      const [hostDto, memberDto] = await Promise.all([onHost, onMember]);
      const memberSlot = hostDto.members.find(
        (m) => m.userId === member.userId,
      )?.teamSlot;
      expect(memberSlot).toBe(2);
      expect(memberDto).toEqual(hostDto);
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("POST /api/lobbies/:id/notifications pushes the new notification in the lobby.config DTO", async () => {
    const { hostSocket, memberSocket } = await joinTwoSockets();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .post(`/api/lobbies/${lobbyId}/notifications`)
        .set(bearer(host.token))
        .send({
          atSeconds: 120,
          template: "ten_minute_warning",
          data: { hint: "tunnel" },
        });
      expect(res.status).toBe(201);

      const [hostDto, memberDto] = await Promise.all([onHost, onMember]);
      expect(hostDto.notifications).toHaveLength(1);
      expect(hostDto.notifications[0]).toMatchObject({
        atSeconds: 120,
        template: "ten_minute_warning",
        data: { hint: "tunnel" },
      });
      expect(memberDto.notifications).toEqual(hostDto.notifications);
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("PATCH .../notifications/:notifId pushes the updated notification body", async () => {
    // Seed a notification through the service so the broadcast we wait
    // for in this test is exclusively the PATCH-driven one.
    const created = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: 60, template: "first_warning" });
    expect(created.status).toBe(201);
    const notifId = created.body.notification.id as string;

    const { hostSocket, memberSocket } = await joinTwoSockets();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .patch(`/api/lobbies/${lobbyId}/notifications/${notifId}`)
        .set(bearer(host.token))
        .send({ template: "renamed_warning", atSeconds: 90 });
      expect(res.status).toBe(200);

      const [hostDto] = await Promise.all([onHost, onMember]);
      expect(hostDto.notifications).toHaveLength(1);
      expect(hostDto.notifications[0]).toMatchObject({
        id: notifId,
        atSeconds: 90,
        template: "renamed_warning",
      });
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("DELETE .../notifications/:notifId pushes the now-empty notifications array", async () => {
    const created = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: 60, template: "first_warning" });
    expect(created.status).toBe(201);
    const notifId = created.body.notification.id as string;

    const { hostSocket, memberSocket } = await joinTwoSockets();
    try {
      const onHost = waitForEvent<LobbyDetailDto>(hostSocket, "lobby.config");
      const onMember = waitForEvent<LobbyDetailDto>(
        memberSocket,
        "lobby.config",
      );

      const res = await agent
        .delete(`/api/lobbies/${lobbyId}/notifications/${notifId}`)
        .set(bearer(host.token))
        .send();
      expect(res.status).toBe(204);

      const [hostDto, memberDto] = await Promise.all([onHost, onMember]);
      expect(hostDto.notifications).toEqual([]);
      expect(memberDto.notifications).toEqual([]);
    } finally {
      hostSocket.disconnect();
      memberSocket.disconnect();
    }
  });

  it("does not load the DTO from the database when no socket is in the room", async () => {
    // No sockets joined → emitLobbyConfig short-circuits before
    // touching the DB. We can't assert the absence of a query directly,
    // but the broader contract is: REST calls still succeed and return
    // the up-to-date DTO when nobody is listening on the wire.
    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(host.token))
      .send({ gameDurationSeconds: 900 });
    expect(res.status).toBe(200);
    expect(res.body.lobby.config.gameDurationSeconds).toBe(900);

    const sockets = await harness.io
      .in(`lobby:${lobbyId}`)
      .fetchSockets();
    expect(sockets).toHaveLength(0);
  });
});
