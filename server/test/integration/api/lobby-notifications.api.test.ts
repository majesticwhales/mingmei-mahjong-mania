import { beforeEach, describe, expect, it } from "vitest";
import { registerAdminViaApi, registerViaApi } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { bearer, getAgent } from "../../setup/http.ts";

async function createLobby(token: string) {
  const agent = await getAgent();
  const res = await agent
    .post("/api/lobbies")
    .set(bearer(token))
    .send({});
  if (res.status !== 201) {
    throw new Error(`createLobby failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.lobby.id as string;
}

describe("lobby notifications API", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 401 without a token", async () => {
    const agent = await getAgent();
    const res = await agent.get("/api/lobbies/00000000-0000-0000-0000-000000000000/notifications");
    expect(res.status).toBe(401);
  });

  it("host can create, list, update, and delete notifications", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const lobbyId = await createLobby(host.token);

    const created = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({
        atSeconds: 600,
        template: "time_warning",
        data: { minutesLeft: 10 },
      });
    expect(created.status).toBe(201);
    expect(created.body.notification.atSeconds).toBe(600);
    expect(created.body.notification.template).toBe("time_warning");
    expect(created.body.notification.data).toEqual({ minutesLeft: 10 });

    const notifId = created.body.notification.id as string;

    const second = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: 0, template: "game_start" });
    expect(second.status).toBe(201);
    expect(second.body.notification.data).toBeNull();

    const listed = await agent
      .get(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token));
    expect(listed.status).toBe(200);
    expect(listed.body.notifications).toHaveLength(2);
    expect(listed.body.notifications[0].template).toBe("game_start");

    const patched = await agent
      .patch(`/api/lobbies/${lobbyId}/notifications/${notifId}`)
      .set(bearer(host.token))
      .send({ atSeconds: 300, data: null });
    expect(patched.status).toBe(200);
    expect(patched.body.notification.atSeconds).toBe(300);
    expect(patched.body.notification.template).toBe("time_warning");
    expect(patched.body.notification.data).toBeNull();

    const deleted = await agent
      .delete(`/api/lobbies/${lobbyId}/notifications/${notifId}`)
      .set(bearer(host.token));
    expect(deleted.status).toBe(204);

    const afterDelete = await agent
      .get(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token));
    expect(afterDelete.body.notifications).toHaveLength(1);
  });

  it("rejects mutation from non-host", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const guest = await registerViaApi(agent);
    const lobbyId = await createLobby(host.token);
    await agent.post(`/api/lobbies/${lobbyId}/join`).set(bearer(guest.token));

    const res = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(guest.token))
      .send({ atSeconds: 0, template: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("rejects listing from a non-member", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const outsider = await registerViaApi(agent);
    const lobbyId = await createLobby(host.token);

    const res = await agent
      .get(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(outsider.token));
    expect(res.status).toBe(403);
  });

  it("validates request bodies", async () => {
    const agent = await getAgent();
    const host = await registerAdminViaApi(agent);
    const lobbyId = await createLobby(host.token);

    const missingTemplate = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: 0 });
    expect(missingTemplate.status).toBe(400);

    const negativeAt = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: -1, template: "x" });
    expect(negativeAt.status).toBe(400);

    const arrayData = await agent
      .post(`/api/lobbies/${lobbyId}/notifications`)
      .set(bearer(host.token))
      .send({ atSeconds: 0, template: "x", data: [1, 2, 3] });
    expect(arrayData.status).toBe(400);
  });
});
