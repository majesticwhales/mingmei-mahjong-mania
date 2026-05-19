import { beforeEach, describe, expect, it } from "vitest";
import { registerViaApi } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { bearer, getAgent } from "../../setup/http.ts";

describe("POST /api/lobbies", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 401 without a token", async () => {
    const agent = await getAgent();
    const res = await agent.post("/api/lobbies").send({});
    expect(res.status).toBe(401);
  });

  it("creates a lobby for the authenticated host", async () => {
    const agent = await getAgent();
    const host = await registerViaApi(agent);

    const res = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ teamAssignmentMode: "pick" });

    expect(res.status).toBe(201);
    expect(res.body.lobby.hostUserId).toBe(host.userId);
    expect(res.body.lobby.config.defaultStartNodeCode).toBe("bay");
    expect(res.body.lobby.readiness.ready).toBe(false);
  });
});

describe("GET /api/lobbies/:id", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 403 for a non-member", async () => {
    const agent = await getAgent();
    const host = await registerViaApi(agent);
    const outsider = await registerViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({});

    const res = await agent
      .get(`/api/lobbies/${created.body.lobby.id}`)
      .set(bearer(outsider.token));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

describe("PATCH /api/lobbies/:id/config", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 403 when a guest tries to update config", async () => {
    const agent = await getAgent();
    const host = await registerViaApi(agent);
    const guest = await registerViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({});

    const lobbyId = created.body.lobby.id as string;

    await agent.post(`/api/lobbies/${lobbyId}/join`).set(bearer(guest.token));

    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(guest.token))
      .send({ gameDurationSeconds: 3600 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

describe("lobby flow through start", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("starts a game when four players have picked distinct teams", async () => {
    const agent = await getAgent();
    const players = await Promise.all([
      registerViaApi(agent),
      registerViaApi(agent),
      registerViaApi(agent),
      registerViaApi(agent),
    ]);
    const host = players[0]!;

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ teamAssignmentMode: "pick" });

    const lobbyId = created.body.lobby.id as string;

    for (let i = 1; i < 4; i += 1) {
      const joined = await agent
        .post(`/api/lobbies/${lobbyId}/join`)
        .set(bearer(players[i]!.token));
      expect(joined.status).toBe(200);
    }

    for (let i = 0; i < 4; i += 1) {
      const picked = await agent
        .post(`/api/lobbies/${lobbyId}/team`)
        .set(bearer(players[i]!.token))
        .send({ teamSlot: i + 1 });
      expect(picked.status).toBe(200);
    }

    const ready = await agent
      .get(`/api/lobbies/${lobbyId}`)
      .set(bearer(host.token));
    expect(ready.body.lobby.readiness.ready).toBe(true);

    const started = await agent
      .post(`/api/lobbies/${lobbyId}/start`)
      .set(bearer(host.token));

    expect(started.status).toBe(201);
    expect(started.body.status).toBe("active");
    expect(started.body.gameId).toBeTruthy();
  });
});
