import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameChallengeInstance } from "../../../../src/models/game-challenge-instance.ts";
import { GameScheduledJob } from "../../../../src/models/game-scheduled-job.ts";
import { GameTeam } from "../../../../src/models/game-team.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import { GameTile } from "../../../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../../../src/models/game-tile-placement.ts";
import { TileType } from "../../../../src/models/tile-type.ts";
import {
  attachChallengeToGameNode,
  clearTestChallenges,
} from "../../../setup/challenges.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

/**
 * Phase J chunk 2 — `CLAIM_WIN` handler. Covers validation, snapshot
 * stamping, placement movement, and the integration with the existing
 * challenge / credit gates. Auto-`GAME_END` upsert is exercised in
 * chunk 3 against this same handler.
 */

/**
 * Place `tiles` (described as `[suit, rank, copyIndex]` triples) into
 * the given team's hand by minting fresh `game_tile` + `game_tile_placement`
 * rows pointing at the matching `tile_types` row. Mirrors the
 * `placeHandTiles` helper from the projection tests so this suite can
 * craft a known tenpai hand without reaching into the lightweight
 * fixture's random tile-type stream.
 */
async function placeHandTiles(
  gameId: string,
  gameTeamId: string,
  tiles: ReadonlyArray<readonly [string, number, number]>,
): Promise<void> {
  const tileTypes = await Promise.all(
    tiles.map(([suit, rank, copyIndex]) =>
      TileType.findOne({ where: { suit, rank, copyIndex } }),
    ),
  );
  for (let i = 0; i < tileTypes.length; i += 1) {
    if (!tileTypes[i]) {
      throw new Error(
        `tile_types row missing for (${tiles[i]!.join(", ")}); did the seed run?`,
      );
    }
  }
  const gameTiles = await GameTile.bulkCreate(
    tileTypes.map((tt, i) => ({
      gameId,
      tileTypeId: tt!.id,
      copyIndex: tiles[i]![2],
    })),
    { returning: true },
  );
  await GameTilePlacement.bulkCreate(
    gameTiles.map((gt) => ({
      gameTileId: gt.id,
      gameNodeId: null,
      gameTeamId,
      slotIndex: null,
    })),
  );
}

/**
 * Park a specific tile at a station slot. Returns `game_tiles.id` so
 * the test can use it as the `stationTileId` payload.
 */
async function placeStationTile(args: {
  gameId: string;
  gameNodeId: string;
  slotIndex: number;
  tile: readonly [string, number, number];
}): Promise<string> {
  const [suit, rank, copyIndex] = args.tile;
  const tileType = await TileType.findOne({
    where: { suit, rank, copyIndex },
  });
  if (!tileType) {
    throw new Error(
      `tile_types row missing for (${suit}, ${rank}, ${copyIndex}); did the seed run?`,
    );
  }
  const gameTile = await GameTile.create({
    gameId: args.gameId,
    tileTypeId: tileType.id,
    copyIndex,
  });
  await GameTilePlacement.create({
    gameTileId: gameTile.id,
    gameNodeId: args.gameNodeId,
    gameTeamId: null,
    slotIndex: args.slotIndex,
  });
  return gameTile.id;
}

/**
 * Seed the canonical shanpon-tenpai hand used by the happy-path tests
 * — `234m 234p 234s 55p 88p` (13 tiles), wait on 5p / 8p. Tanyao +
 * sanshoku-doujun + (yakuhai-free shape), three-han with a fourth from
 * either dora or red fives if the test enables them.
 */
async function seedShanponTenpai(
  gameId: string,
  gameTeamId: string,
): Promise<void> {
  await placeHandTiles(gameId, gameTeamId, [
    ["man", 2, 0], ["man", 3, 0], ["man", 4, 0],
    ["pin", 2, 0], ["pin", 3, 0], ["pin", 4, 0],
    ["sou", 2, 0], ["sou", 3, 0], ["sou", 4, 0],
    ["pin", 5, 1], ["pin", 5, 2],
    ["pin", 8, 0], ["pin", 8, 1],
  ]);
}

describe("CLAIM_WIN handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("snapshots the team and moves the station tile into the hand on a winning claim", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    // Wait set is 5p / 8p; plant an 8p (copyIndex=2) at slot 0.
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CLAIM_WIN");
    const payload = event!.payload as {
      nodeId: string;
      nodeCode: string;
      stationTileId: string;
      slotIndex: number;
      finalHan: number;
      finalFu: number;
      finalPoints: number;
      finalYaku: { name: string; han: number }[];
      isYakuman: boolean;
    };
    expect(payload.nodeId).toBe(bayId);
    expect(payload.nodeCode).toBe("bay");
    expect(payload.stationTileId).toBe(stationTileId);
    expect(payload.slotIndex).toBe(0);
    expect(payload.finalHan).toBeGreaterThanOrEqual(3);
    expect(payload.finalPoints).toBeGreaterThan(0);
    expect(payload.isYakuman).toBe(false);
    const yakuNames = payload.finalYaku.map((y) => y.name);
    expect(yakuNames).toContain("All Simples");
    expect(yakuNames).toContain("Three Colour Straight");

    // Placement moved from station into the team's hand.
    const placement = await GameTilePlacement.findOne({
      where: { gameTileId: stationTileId },
    });
    expect(placement?.gameNodeId).toBeNull();
    expect(placement?.slotIndex).toBeNull();
    expect(placement?.gameTeamId).toBe(participant.gameTeamId);

    // Team snapshot columns populated.
    const team = await GameTeam.findByPk(participant.gameTeamId);
    expect(team?.handCompletedAt).toBeInstanceOf(Date);
    expect(team?.winningTileId).toBe(stationTileId);
    expect(team?.winningNodeId).toBe(bayId);
    expect(team?.finalHan).toBe(payload.finalHan);
    expect(team?.finalFu).toBe(payload.finalFu);
    expect(team?.finalPoints).toBe(payload.finalPoints);
    expect(team?.finalYakuKeys).toEqual(payload.finalYaku);
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      // No `startNodeCodeBySlot` — team is unchecked.
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("rejects with not_at_station when stationTileId is at a different node", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const elsewhereId = fixture.nodeIdByCode.get("bloor-yonge")!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: elsewhereId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 400, code: "not_at_station" });
  });

  it("rejects with not_at_station when stationTileId is unknown", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 400, code: "not_at_station" });
  });

  it("rejects with slot_locked when claiming a slot whose unlock offset is in the future", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 60 * 60],
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    // Wait tile parked at the still-locked slot 1.
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 1,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "slot_locked" });
  });

  it("rejects with swap_credit_required when the station carries a challenge and the team lacks a credit", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "swap_credit_required" });
  });

  it("consumes pending_swap_credit when the station has a challenge and the team holds a credit", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameTeamPosition.update(
      { pendingSwapCredit: true, creditEarnedInSession: true },
      { where: { gameTeamId: participant.gameTeamId } },
    );
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });
    expect(result.events[0]!.eventType).toBe("CLAIM_WIN");

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(false);
    // `credit_earned_in_session` stays sticky, mirroring SWAP_TILE.
    expect(position?.creditEarnedInSession).toBe(true);
  });

  it("rejects with not_a_winning_tile when the claimed tile is not in the wait set", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    // 1p is not in the 5p/8p wait set.
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 1, 1],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_a_winning_tile" });
  });

  it("rejects with not_a_winning_tile when the hand isn't 13 tiles", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 5 },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_a_winning_tile" });
  });

  it("rejects with hand_completed when the team has already claimed once", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: { stationTileId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });

  it("rejects with invalid_payload when stationTileId is missing", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CLAIM_WIN",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  // -------------------------------------------------------------------------
  // Phase J chunk 3 — auto-GAME_END upsert from CLAIM_WIN. The handler bumps
  // the existing `GAME_END` scheduled job's `runAt` to `now()` when the
  // claiming team was the last incomplete one. (The scheduler tick itself
  // is exercised by `system-handlers.test.ts`.)
  // -------------------------------------------------------------------------

  it("does NOT advance GAME_END when other teams are still incomplete (3 of 4 left)", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    // Seed a GAME_END job in the far future so we can assert non-mutation.
    const futureRunAt = new Date(Date.now() + 60 * 60 * 1000);
    const job = await GameScheduledJob.create({
      gameId: fixture.gameId,
      jobType: "GAME_END",
      runAt: futureRunAt,
      status: "pending",
      payload: null,
    });

    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });

    const refreshed = await GameScheduledJob.findByPk(job.id);
    expect(refreshed?.status).toBe("pending");
    expect(refreshed?.runAt.toISOString()).toBe(futureRunAt.toISOString());

    // The other three teams are still hand_completed_at = NULL.
    const remaining = await GameTeam.count({
      where: { gameId: fixture.gameId, handCompletedAt: null },
    });
    expect(remaining).toBe(3);
  });

  it("advances GAME_END runAt to ~now when the claiming team is the last incomplete one", async () => {
    // Three teams pre-marked as completed via the lightweight knob; the
    // fourth team carries the tenpai hand and claims via the handler.
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 4: "bay" },
      handTilesBySlot: { 1: 1, 2: 1, 3: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 1000 },
        { slot: 2, finalPoints: 2000 },
        { slot: 3, finalPoints: 3000 },
      ],
    });
    const claimant = fixture.participants.find((p) => p.teamSlot === 4)!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const futureRunAt = new Date(Date.now() + 60 * 60 * 1000);
    const job = await GameScheduledJob.create({
      gameId: fixture.gameId,
      jobType: "GAME_END",
      runAt: futureRunAt,
      status: "pending",
      payload: null,
    });

    await seedShanponTenpai(fixture.gameId, claimant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    const beforeMs = Date.now();
    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: claimant.gameTeamId,
      userId: claimant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });
    const afterMs = Date.now();

    const refreshed = await GameScheduledJob.findByPk(job.id);
    expect(refreshed?.status).toBe("pending");
    // `runAt` was bumped into the [before, after] window (not the
    // pre-seeded future).
    const runAtMs = refreshed!.runAt.getTime();
    expect(runAtMs).toBeGreaterThanOrEqual(beforeMs);
    expect(runAtMs).toBeLessThanOrEqual(afterMs);

    // Every team is now completed.
    const incomplete = await GameTeam.count({
      where: { gameId: fixture.gameId, handCompletedAt: null },
    });
    expect(incomplete).toBe(0);
  });

  it("does not upsert GAME_END when no row exists (no-op update is safe)", async () => {
    // Lightweight fixture omits the GAME_END seed (it's only seeded by
    // `startFromLobby`). The handler's update affects 0 rows; the test
    // asserts the handler still succeeds end-to-end.
    const fixture = await setupLightweightGame({
      participantCount: 4,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 4: "bay" },
      handTilesBySlot: { 1: 1, 2: 1, 3: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 1000 },
        { slot: 2, finalPoints: 2000 },
        { slot: 3, finalPoints: 3000 },
      ],
    });
    const claimant = fixture.participants.find((p) => p.teamSlot === 4)!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    await seedShanponTenpai(fixture.gameId, claimant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: claimant.gameTeamId,
      userId: claimant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });
    expect(result.events[0]!.eventType).toBe("CLAIM_WIN");

    // No job was created by the handler — the upsert filters by
    // `(gameId, jobType=GAME_END)` and the lightweight fixture didn't
    // seed one.
    const jobs = await GameScheduledJob.findAll({
      where: { gameId: fixture.gameId, jobType: "GAME_END" },
    });
    expect(jobs).toHaveLength(0);
  });

  it("auto-forfeits an in-progress challenge instance on a successful claim", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    // Plant a stale in-progress instance with a credit already in hand
    // — challenge gate passes, so CLAIM_WIN should still auto-forfeit
    // the lingering row when it succeeds.
    const instance = await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "in_progress",
      assignedAt: new Date(),
    });
    await GameTeamPosition.update(
      { pendingSwapCredit: true, creditEarnedInSession: true },
      { where: { gameTeamId: participant.gameTeamId } },
    );
    await seedShanponTenpai(fixture.gameId, participant.gameTeamId);
    const stationTileId = await placeStationTile({
      gameId: fixture.gameId,
      gameNodeId: bayId,
      slotIndex: 0,
      tile: ["pin", 8, 2],
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CLAIM_WIN",
      payload: { stationTileId },
    });
    expect(result.events.map((e) => e.eventType)).toEqual([
      "CLAIM_WIN",
      "CHALLENGE_FORFEITED",
    ]);

    const refreshed = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshed?.status).toBe("failed");
    expect(refreshed?.cooldownUntil).toBeInstanceOf(Date);
  });
});
