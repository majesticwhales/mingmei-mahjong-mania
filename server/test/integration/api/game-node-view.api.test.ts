import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { Game } from "../../../src/models/game.ts";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { bearer, getAgent, type ApiAgent } from "../../setup/http.ts";

/**
 * Phase L §3.14 — `GET /api/games/:id/nodes/:nodeId/view`.
 *
 * Exercises the route's authz wall (401 / 403), the service-level
 * 404 / 409 paths, and the at-station privilege + tiles[] parity
 * contract between this REST surface and the socket projection. The
 * action-reason matrix is covered by the service unit suite in
 * `services/node-view.test.ts`; this file pins the HTTP envelope and
 * the cross-surface parity invariant.
 */

describe("GET /api/games/:id/nodes/:nodeId/view", () => {
  let agent: ApiAgent;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    agent = await getAgent();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 401 without a bearer token", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const res = await agent.get(
      `/api/games/${fixture.gameId}/nodes/${bayId}/view`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 forbidden when the requester is not a game participant", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const outsider = await registerUser();
    const token = signAccessToken(outsider.user.id);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/nodes/${bayId}/view`)
      .set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.message).toBe("Not a participant of this game");
  });

  it("returns 403 (not 404) when the game does not exist — no enumeration", async () => {
    const outsider = await registerUser();
    const token = signAccessToken(outsider.user.id);
    const res = await agent
      .get(
        `/api/games/00000000-0000-0000-0000-000000000000/nodes/00000000-0000-0000-0000-000000000000/view`,
      )
      .set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("returns 404 node_not_found for a node id not on this game's map", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(
        `/api/games/${fixture.gameId}/nodes/00000000-0000-0000-0000-000000000000/view`,
      )
      .set(bearer(token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("node_not_found");
  });

  it("returns 409 game_ended once the game row flips to ended", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const participant = fixture.participants[0]!;
    await Game.update(
      { status: "ended" },
      { where: { id: fixture.gameId } },
    );
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/nodes/${bayId}/view`)
      .set(bearer(token));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("game_ended");
  });

  it("returns the per-team node view with tiles[] + currentChallenge + availableActions", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      visibilityMode: "slot",
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .get(`/api/games/${fixture.gameId}/nodes/${bayId}/view`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.nodeId).toBe(bayId);
    expect(res.body.code).toBe("bay");
    expect(Array.isArray(res.body.tiles)).toBe(true);
    expect(res.body.tiles).toHaveLength(1);
    expect(res.body.tiles[0]).toMatchObject({
      slotIndex: 0,
      visible: true,
      locked: false,
    });
    expect(res.body.tiles[0].tile).not.toBeNull();
    expect(res.body.currentChallenge).toBeNull();
    expect(Array.isArray(res.body.availableActions)).toBe(true);
    const byAction = new Map<string, { enabled: boolean; reason?: string }>(
      (
        res.body.availableActions as Array<{
          action: string;
          enabled: boolean;
          reason?: string;
        }>
      ).map((a) => [a.action, { enabled: a.enabled, reason: a.reason }]),
    );
    expect(byAction.get("check_out")).toEqual({ enabled: true });
    expect(byAction.get("swap_tile")).toEqual({ enabled: true });
    // CHECK_IN is omitted when the team is already at this station.
    expect(byAction.has("check_in")).toBe(false);
  });

  it("applies the at-station privilege when the requester is at this node (tiles[] matches the projection's atStation.tiles[])", async () => {
    // Tier 2 spec: claim=0 / map=3600 → station-visible from t=0,
    // map-hidden until t=3600. The endpoint must reproduce the same
    // privilege the socket projection's `atStation.tiles[]` applies,
    // so the StationPanel can read from either surface without re-
    // deriving visibility rules.
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      nodeTilesByCode: { bay: 2 },
      slotsPerNode: 2,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 0],
      slotMapUnlockOffsetsSeconds: [0, 3600],
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .get(`/api/games/${fixture.gameId}/nodes/${bayId}/view`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(
      (res.body.tiles as Array<{ visible: boolean }>).map((t) => t.visible),
    ).toEqual([true, true]);

    // Cross-surface parity: the projection's `atStation.tiles[]` for
    // the same team + clock window must match the route's `tiles[]`
    // byte-for-byte. Build a projection inside the same request window
    // (with a shared `now`) and compare.
    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.atStation?.tiles.map((t) => t.visible)).toEqual([
      true,
      true,
    ]);
    expect(projection.atStation?.tiles.map((t) => t.locked)).toEqual(
      (res.body.tiles as Array<{ locked: boolean }>).map((t) => t.locked),
    );
    expect(projection.atStation?.tiles.map((t) => t.slotIndex)).toEqual(
      (res.body.tiles as Array<{ slotIndex: number }>).map((t) => t.slotIndex),
    );
  });

  it("withholds the at-station privilege when the requester views some other node", async () => {
    // Same offsets as the privilege test, but the team is at `north`
    // and queries `bay`. The strict map rule applies → slot 1 stays
    // hidden + tile null even though it's claim-unlocked.
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay", "north"],
      startNodeCodeBySlot: { 1: "north" },
      nodeTilesByCode: { bay: 2, north: 2 },
      slotsPerNode: 2,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 0],
      slotMapUnlockOffsetsSeconds: [0, 3600],
    });
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .get(`/api/games/${fixture.gameId}/nodes/${bayId}/view`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(
      (res.body.tiles as Array<{ visible: boolean }>).map((t) => t.visible),
    ).toEqual([true, false]);
    expect(res.body.tiles[1].tile).toBeNull();

    // The check_out action surfaces with `wrong_node` since the team
    // is at `north`, not `bay` — sanity-check the reason wiring.
    const checkOut = (
      res.body.availableActions as Array<{
        action: string;
        enabled: boolean;
        reason?: string;
      }>
    ).find((a) => a.action === "check_out")!;
    expect(checkOut).toEqual({
      action: "check_out",
      enabled: false,
      reason: "wrong_node",
    });
  });
});
