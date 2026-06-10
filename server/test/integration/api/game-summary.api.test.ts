import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { TileType } from "../../../src/models/tile-type.ts";
import { runSchedulerTick } from "../../../src/scheduler/run-tick.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { bearer, getAgent, type ApiAgent } from "../../setup/http.ts";

/**
 * Phase J — `GET /api/games/:id/summary` (TDD §3.10, §7).
 *
 * Exercises the route's authz wall (401 / 403), the `game_not_ended`
 * gate, and the read-side scoring snapshot that powers the scoreboard
 * UI. Drives the game-end transition through `runSchedulerTick` (same
 * path the production scheduler takes) so the test's `GAME_ENDED`
 * payload matches what the service reads in production.
 */

/**
 * Mint a 13-tile hand for the given team from the seeded `tile_types`
 * catalog. Mirrors `placeHandTiles` in `claim-win.test.ts`. Used to
 * craft a tenpai hand for the noten-with-waits coverage; we duplicate
 * here to keep the test self-contained. Callers must pass the same
 * `tiles` set as `reservedTileTypes` to `setupLightweightGame` so the
 * fixture's auto-dealer doesn't pre-mint a conflicting `game_tile`
 * row and trip `game_tiles_game_type_copy_unique`.
 */
async function placeHandTiles(
  gameId: string,
  gameTeamId: string,
  tiles: ReadonlyArray<readonly [string, number, number]>,
): Promise<void> {
  for (const [suit, rank, copyIndex] of tiles) {
    const tileType = await TileType.findOne({
      where: { suit, rank, copyIndex },
    });
    if (!tileType) {
      throw new Error(
        `tile_types row missing for (${suit}, ${rank}, ${copyIndex}); did the seed run?`,
      );
    }
    const gameTile = await GameTile.create({
      gameId,
      tileTypeId: tileType.id,
      copyIndex,
    });
    await GameTilePlacement.create({
      gameTileId: gameTile.id,
      gameNodeId: null,
      gameTeamId,
      slotIndex: null,
    });
  }
}

/**
 * The 13 tile-types making up the canonical shanpon-tenpai hand below.
 * Exposed so the test can pass the same set as `reservedTileTypes` to
 * `setupLightweightGame`, preventing the fixture's auto-dealer from
 * minting colliding `game_tiles` for these `(suit, rank, copyIndex)`
 * triples when `handTilesBySlot` is set.
 */
const SHANPON_TENPAI_TILES: ReadonlyArray<readonly [string, number, number]> = [
  ["man", 2, 0],
  ["man", 3, 0],
  ["man", 4, 0],
  ["pin", 2, 0],
  ["pin", 3, 0],
  ["pin", 4, 0],
  ["sou", 2, 0],
  ["sou", 3, 0],
  ["sou", 4, 0],
  ["pin", 5, 1],
  ["pin", 5, 2],
  ["pin", 8, 0],
  ["pin", 8, 1],
];

/**
 * Canonical shanpon-tenpai hand from the chunk-2 claim-win suite:
 * `234m 234p 234s 55p 88p`, 13 tiles, wait on 5p / 8p. We re-seed it
 * here so the summary endpoint can demonstrate `waits[]` over a known
 * shape without an `analyzeHand` round-trip outside the service.
 */
async function seedShanponTenpai(
  gameId: string,
  gameTeamId: string,
): Promise<void> {
  await placeHandTiles(gameId, gameTeamId, SHANPON_TENPAI_TILES);
}

async function insertGameEndJob(gameId: string): Promise<void> {
  await GameScheduledJob.create({
    gameId,
    jobType: "GAME_END",
    runAt: new Date(Date.now() - 1000),
    status: "pending",
    payload: null,
  });
}

describe("GET /api/games/:id/summary", () => {
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
    const res = await agent.get(`/api/games/${fixture.gameId}/summary`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the requesting user is not a game participant", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const outsider = await registerUser();
    const token = signAccessToken(outsider.user.id);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.message).toBe("Not a participant of this game");
  });

  it("returns 404 when the game does not exist (after participant gate is skipped → 403)", async () => {
    // Authz check runs first: an outsider asking about a non-existent
    // game gets 403 (matches the no-enumeration policy).
    const outsider = await registerUser();
    const token = signAccessToken(outsider.user.id);
    const res = await agent
      .get(`/api/games/00000000-0000-0000-0000-000000000000/summary`)
      .set(bearer(token));
    expect(res.status).toBe(403);
  });

  it("returns 409 game_not_ended while the game is still active", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
    });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("game_not_ended");
  });

  it("returns the full per-team summary for a timer-ended game with mixed completion", async () => {
    // Slot 1 completes via `markTeamHandCompleted` (3 han / 30 fu /
    // 3900 points, custom yaku list); slot 2 holds a tenpai hand
    // (5p/8p waits); slot 3 holds whatever the random deal gave it
    // (almost certainly noten, asserted as `waits: null`); slot 4 has
    // no hand tiles dealt (also noten, hand length 0).
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1, 3: 5 },
      markTeamHandCompleted: [
        {
          slot: 1,
          finalHan: 3,
          finalFu: 30,
          finalPoints: 3900,
          finalYakuKeys: [
            { name: "Riichi", han: 1 },
            { name: "Tsumo", han: 1 },
            { name: "Pinfu", han: 1 },
          ],
        },
      ],
      // Reserve the shanpon-tenpai tile-types so the auto-dealer feeding
      // `handTilesBySlot: { 1: 1, 3: 5 }` doesn't snipe a row that
      // `seedShanponTenpai(slot 2)` then tries to insert; without this,
      // the manual `GameTile.create` below trips
      // `game_tiles_game_type_copy_unique`.
      reservedTileTypes: SHANPON_TENPAI_TILES,
    });
    // Slot 2: build the shanpon-tenpai hand so the service runs
    // analyzeHand and surfaces `waits[]`.
    const teamSlot2 = fixture.gameTeamIdBySlot.get(2)!;
    await seedShanponTenpai(fixture.gameId, teamSlot2);
    // Drive the GAME_END transition through the scheduler so the
    // `GAME_ENDED` event payload (endedAt / endReason / winningGameTeamId)
    // matches the production write path.
    await insertGameEndJob(fixture.gameId);
    const tickResult = await runSchedulerTick({});
    expect(tickResult).toEqual({ processed: 1, failed: 0 });

    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(200);

    const summary = res.body;
    expect(summary.gameId).toBe(fixture.gameId);
    expect(summary.endReason).toBe("timer");
    // Only slot 1 has non-zero finalPoints, so the strict winner is
    // unambiguous.
    expect(summary.winningGameTeamId).toBe(fixture.gameTeamIdBySlot.get(1));
    expect(typeof summary.endedAt).toBe("string");

    expect(summary.teams).toHaveLength(4);
    // Teams come back sorted by `team_definition.sort_order` ASC →
    // east (slot 1), south (slot 2), west (slot 3), north (slot 4).
    expect(summary.teams.map((t: { teamCode: string }) => t.teamCode)).toEqual([
      "east",
      "south",
      "west",
      "north",
    ]);

    const east = summary.teams[0];
    expect(east.gameTeamId).toBe(fixture.gameTeamIdBySlot.get(1));
    expect(east.handCompletedAt).not.toBeNull();
    expect(east.winningTile).not.toBeNull();
    expect(east.winningNodeCode).toBe("bay");
    expect(east.finalHand).toHaveLength(1);
    expect(east.finalHan).toBe(3);
    expect(east.finalFu).toBe(30);
    expect(east.finalPoints).toBe(3900);
    expect(east.finalYaku).toEqual([
      { name: "Riichi", han: 1 },
      { name: "Tsumo", han: 1 },
      { name: "Pinfu", han: 1 },
    ]);
    expect(east.isYakuman).toBe(false);
    expect(east.waits).toBeNull();

    const south = summary.teams[1];
    expect(south.handCompletedAt).toBeNull();
    expect(south.winningTile).toBeNull();
    expect(south.winningNodeCode).toBeNull();
    expect(south.finalHand).toHaveLength(13);
    expect(south.finalHan).toBe(0);
    expect(south.finalFu).toBe(0);
    expect(south.finalPoints).toBe(0);
    expect(south.finalYaku).toEqual([]);
    expect(south.isYakuman).toBe(false);
    // Shanpon-tenpai → orchestrator returns at least one wait per
    // candidate tile (5p / 8p). Both copyIndices may surface, depending
    // on the orchestrator's preference; we assert the set non-empty
    // and that each wait carries the AnalyzedWait shape.
    expect(Array.isArray(south.waits)).toBe(true);
    expect(south.waits.length).toBeGreaterThanOrEqual(1);
    for (const wait of south.waits) {
      expect(typeof wait.han).toBe("number");
      expect(typeof wait.fu).toBe("number");
      expect(typeof wait.points).toBe("number");
      expect(typeof wait.isYakuman).toBe("boolean");
      expect(wait.tile.suit).toBe("pin");
      expect([5, 8]).toContain(wait.tile.rank);
    }

    const west = summary.teams[2];
    expect(west.handCompletedAt).toBeNull();
    expect(west.finalHand).toHaveLength(5);
    // 5-tile hand → not a 13-tile shape → service returns waits: null.
    expect(west.waits).toBeNull();

    const north = summary.teams[3];
    expect(north.handCompletedAt).toBeNull();
    expect(north.finalHand).toHaveLength(0);
    expect(north.waits).toBeNull();
  });

  it("returns endReason='all_teams_completed' when every team has a CLAIM_WIN snapshot", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1, 2: 1, 3: 1, 4: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 4000 },
        { slot: 2, finalPoints: 8000 },
        { slot: 3, finalPoints: 2000 },
        { slot: 4, finalPoints: 5200 },
      ],
    });
    await insertGameEndJob(fixture.gameId);
    const tickResult = await runSchedulerTick({});
    expect(tickResult).toEqual({ processed: 1, failed: 0 });

    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.endReason).toBe("all_teams_completed");
    expect(res.body.winningGameTeamId).toBe(fixture.gameTeamIdBySlot.get(2));
    for (const team of res.body.teams) {
      expect(team.handCompletedAt).not.toBeNull();
      expect(team.waits).toBeNull();
      expect(team.finalHand).toHaveLength(1);
    }
  });

  it("returns winningGameTeamId=null when the top points are tied", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1, 2: 1, 3: 1, 4: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 8000 },
        { slot: 2, finalPoints: 8000 },
        { slot: 3, finalPoints: 4000 },
        { slot: 4, finalPoints: 2000 },
      ],
    });
    await insertGameEndJob(fixture.gameId);
    await runSchedulerTick({});

    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.winningGameTeamId).toBeNull();
    expect(res.body.endReason).toBe("all_teams_completed");
  });

  it("isYakuman is true on a 0-fu / non-zero-han snapshot and false on noten / normal wins", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1, 2: 1 },
      markTeamHandCompleted: [
        {
          slot: 1,
          finalHan: 13,
          finalFu: 0,
          finalPoints: 32000,
          finalYakuKeys: [{ name: "Big Three Dragons", han: 13 }],
        },
        {
          slot: 2,
          finalHan: 2,
          finalFu: 30,
          finalPoints: 2000,
          finalYakuKeys: [
            { name: "Riichi", han: 1 },
            { name: "Tsumo", han: 1 },
          ],
        },
      ],
    });
    await insertGameEndJob(fixture.gameId);
    await runSchedulerTick({});

    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);
    const res = await agent
      .get(`/api/games/${fixture.gameId}/summary`)
      .set(bearer(token));
    expect(res.status).toBe(200);
    const byCode = new Map(
      res.body.teams.map((t: { teamCode: string }) => [t.teamCode, t]),
    );
    expect((byCode.get("east") as { isYakuman: boolean }).isYakuman).toBe(true);
    expect((byCode.get("south") as { isYakuman: boolean }).isYakuman).toBe(false);
    // Noten teams stamped with finalHan=finalFu=finalPoints=0 must not
    // surface as yakuman.
    expect((byCode.get("west") as { isYakuman: boolean }).isYakuman).toBe(false);
    expect((byCode.get("north") as { isYakuman: boolean }).isYakuman).toBe(false);
  });
});
