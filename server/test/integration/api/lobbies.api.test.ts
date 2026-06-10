import { beforeEach, describe, expect, it } from "vitest";
import { registerAdminViaApi, registerViaApi } from "../../setup/auth.ts";
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

  it("creates a lobby for an admin user", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const res = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ teamAssignmentMode: "pick" });

    expect(res.status).toBe(201);
    expect(res.body.lobby.hostUserId).toBe(host.userId);
    expect(res.body.lobby.config.defaultStartNodeCode).toBe("bay");
    expect(res.body.lobby.config.slotsPerNode).toBe(1);
    expect(res.body.lobby.config.visibilityPhaseCount).toBe(4);
    expect(res.body.lobby.readiness.ready).toBe(false);
  });

  it("accepts slotsPerNode and visibilityPhaseCount overrides on create", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const res = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ slotsPerNode: 2, visibilityPhaseCount: 6 });

    expect(res.status).toBe(201);
    expect(res.body.lobby.config.slotsPerNode).toBe(2);
    expect(res.body.lobby.config.visibilityPhaseCount).toBe(6);
  });

  it("rejects non-positive slotsPerNode on create", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const res = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ slotsPerNode: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("rejects create from a non-admin user", async () => {
    const agent = await getAgent();
    const user = await registerViaApi(agent);

    const res = await agent
      .post("/api/lobbies")
      .set(bearer(user.token))
      .send({ teamAssignmentMode: "pick" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

describe("GET /api/lobbies/:id", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 403 for a non-member", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
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
    const host = await registerAdminViaApi(agent);
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

  it("host can patch slotsPerNode and visibilityPhaseCount", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({});
    const lobbyId = created.body.lobby.id as string;

    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(host.token))
      .send({ slotsPerNode: 4, visibilityPhaseCount: 2 });

    expect(res.status).toBe(200);
    expect(res.body.lobby.config.slotsPerNode).toBe(4);
    expect(res.body.lobby.config.visibilityPhaseCount).toBe(2);
  });

  it("host can patch visibilityMode", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({});
    const lobbyId = created.body.lobby.id as string;
    expect(created.body.lobby.config.visibilityMode).toBe("both");

    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(host.token))
      .send({ visibilityMode: "phase" });

    expect(res.status).toBe(200);
    expect(res.body.lobby.config.visibilityMode).toBe("phase");
  });

  it("rejects a bogus visibilityMode with 400 validation_error", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({});
    const lobbyId = created.body.lobby.id as string;

    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(host.token))
      .send({ visibilityMode: "all-the-things" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("returns 400 visibility_knob_locked when patching a phase knob in slot mode", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ visibilityMode: "slot" });
    const lobbyId = created.body.lobby.id as string;

    const res = await agent
      .patch(`/api/lobbies/${lobbyId}/config`)
      .set(bearer(host.token))
      .send({ visibilityPhaseCount: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("visibility_knob_locked");
  });
});

describe("lobby flow through start", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("starts a game when four players have picked distinct teams", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const players = await Promise.all([
      Promise.resolve(host),
      registerViaApi(agent),
      registerViaApi(agent),
      registerViaApi(agent),
    ]);

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

  it("rejects start from a non-admin user", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const players = await Promise.all([
      Promise.resolve(host),
      registerViaApi(agent),
      registerViaApi(agent),
      registerViaApi(agent),
    ]);

    const created = await agent
      .post("/api/lobbies")
      .set(bearer(host.token))
      .send({ teamAssignmentMode: "pick" });

    const lobbyId = created.body.lobby.id as string;

    for (let i = 1; i < 4; i += 1) {
      await agent
        .post(`/api/lobbies/${lobbyId}/join`)
        .set(bearer(players[i]!.token));
    }

    for (let i = 0; i < 4; i += 1) {
      await agent
        .post(`/api/lobbies/${lobbyId}/team`)
        .set(bearer(players[i]!.token))
        .send({ teamSlot: i + 1 });
    }

    const started = await agent
      .post(`/api/lobbies/${lobbyId}/start`)
      .set(bearer(players[1]!.token));

    expect(started.status).toBe(403);
    expect(started.body.error).toBe("forbidden");
  });
});
