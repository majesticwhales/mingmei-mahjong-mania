import { beforeEach, describe, expect, it } from "vitest";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { appendEvent } from "../../../src/engine/event-log.ts";
import { GameEdge } from "../../../src/models/game-edge.ts";
import { GameLine } from "../../../src/models/game-line.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameNodeLine } from "../../../src/models/game-node-line.ts";
import { GameRuleFlag } from "../../../src/models/game-rule-flag.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { MapTemplateLine } from "../../../src/models/map-template-line.ts";
import { TileType } from "../../../src/models/tile-type.ts";
import { RED_FIVES_RULE_KEY } from "../../../src/tiles/red-five.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

async function seedFaceUp(
  gameTeamId: string,
  gameNodeIds: string[],
): Promise<void> {
  await GameLocationTeamVisibility.bulkCreate(
    gameNodeIds.map((gameNodeId) => ({
      gameTeamId,
      gameNodeId,
      isFaceUp: true,
      source: "phase" as const,
      revealedAt: new Date(),
    })),
  );
}

async function findFirstTemplateLineId(): Promise<string> {
  const line = await MapTemplateLine.findOne({ attributes: ["id"] });
  if (!line) {
    throw new Error(
      "Expected at least one map_template_lines row from the TTC 2026 seed",
    );
  }
  return line.id;
}

describe("buildGameStateProjection", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns layout fields, mapLines, and mapEdges with stable ordering", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a", "b"],
    });
    const participant = fixture.participants[0]!;
    const templateLineId = await findFirstTemplateLineId();
    const aId = fixture.nodeIdByCode.get("a")!;
    const bId = fixture.nodeIdByCode.get("b")!;

    const [line1, line2] = await GameLine.bulkCreate(
      [
        {
          gameId: fixture.gameId,
          templateLineId,
          code: "L1",
          name: "Line 1",
          shortName: "1",
          color: "#fff",
          sortOrder: 0,
          renderMetadata: { stationIds: ["a"], bends: null },
        },
        {
          gameId: fixture.gameId,
          templateLineId,
          code: "L2",
          name: "Line 2",
          shortName: "2",
          color: "#000",
          sortOrder: 1,
          renderMetadata: { stationIds: ["b"], bends: null },
        },
      ],
      { returning: true },
    );
    await GameNodeLine.bulkCreate([
      { gameNodeId: aId, gameLineId: line2!.id },
      { gameNodeId: aId, gameLineId: line1!.id },
      { gameNodeId: bId, gameLineId: line2!.id },
    ]);
    await GameEdge.create({
      gameId: fixture.gameId,
      fromGameNodeId: aId,
      toGameNodeId: bId,
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.gameId).toBe(fixture.gameId);
    expect(projection.status).toBe("active");
    expect(typeof projection.endsAt).toBe("string");
    expect(projection.mapNodes).toHaveLength(2);
    expect(projection.mapNodes.map((n) => n.code)).toEqual(["a", "b"]);
    expect(projection.mapNodes[0]!.lineIds).toEqual(["L1", "L2"]);
    expect(projection.mapNodes[0]!.tile).toBeUndefined();
    expect(projection.mapNodes[0]!.tiles).toBeUndefined();
    expect(projection.mapLines.map((l) => l.code)).toEqual(["L1", "L2"]);
    expect(projection.mapEdges).toEqual([{ fromNodeId: aId, toNodeId: bId }]);
    expect(projection.atStation).toBeNull();
    expect(projection.handTiles).toEqual([]);
    expect(projection.recentEvents).toEqual([]);
    expect(projection.nextVisibilityChangeAt).toBeNull();
  });

  it("single-slot: includes `tile` on face-up nodes and omits it on fogged nodes", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a", "b"],
      nodeTilesByCode: { a: 1, b: 1 },
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    await seedFaceUp(participant.gameTeamId, [aId]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    const aNode = projection.mapNodes.find((n) => n.code === "a")!;
    const bNode = projection.mapNodes.find((n) => n.code === "b")!;
    expect(aNode.tile?.instanceId).toBe(
      fixture.nodeTiles.find((t) => t.nodeCode === "a")!.gameTileId,
    );
    expect(aNode.tiles).toBeUndefined();
    expect(bNode.tile).toBeUndefined();
  });

  it("single-slot: atStation always reveals the station tile, even when the node is fogged on the map", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      startNodeCodeBySlot: { 1: "a" },
      nodeTilesByCode: { a: 1 },
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const tileId = fixture.nodeTiles[0]!.gameTileId;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    const aNode = projection.mapNodes.find((n) => n.code === "a")!;
    expect(aNode.tile).toBeUndefined();
    expect(projection.atStation).not.toBeNull();
    expect(projection.atStation).toEqual({
      nodeId: aId,
      code: "a",
      tile: expect.objectContaining({ instanceId: tileId }),
      currentChallenge: null,
      pendingSwapCredit: false,
      creditEarnedInSession: false,
    });
  });

  it("sorts handTiles by (suit_sort_order, rank, copy_index) and assigns sequential slotIndex", async () => {
    const fixture = await setupLightweightGame({
      handTilesBySlot: { 1: 8 },
    });
    const participant = fixture.participants[0]!;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.handTiles).toHaveLength(8);

    const sorted = [...projection.handTiles];
    expect(sorted.map((t) => t.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const tileTypes = await TileType.findAll({
      where: { id: fixture.handTiles.map((t) => t.tileTypeId) },
    });
    const typeById = new Map(tileTypes.map((t) => [t.id, t]));
    const expectedOrder = fixture.handTiles
      .map((h) => {
        const tt = typeById.get(h.tileTypeId)!;
        return {
          instanceId: h.gameTileId,
          suit: tt.suit,
          rank: tt.rank,
          copyIndex: tt.copyIndex,
          suitSortOrder: tt.suitSortOrder,
        };
      })
      .sort((a, b) => {
        if (a.suitSortOrder !== b.suitSortOrder)
          return a.suitSortOrder - b.suitSortOrder;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.copyIndex - b.copyIndex;
      })
      .map((t) => t.instanceId);

    expect(projection.handTiles.map((t) => t.instanceId)).toEqual(
      expectedOrder,
    );
  });

  it("computes isRedFive only when the red_fives_enabled rule flag is on", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;

    const redFiveType = await TileType.findOne({
      where: { suit: "man", rank: 5, copyIndex: 0 },
    });
    const plainType = await TileType.findOne({
      where: { suit: "man", rank: 5, copyIndex: 1 },
    });
    expect(redFiveType).not.toBeNull();
    expect(plainType).not.toBeNull();

    const tiles = await GameTile.bulkCreate(
      [
        {
          gameId: fixture.gameId,
          tileTypeId: redFiveType!.id,
          copyIndex: 0,
        },
        {
          gameId: fixture.gameId,
          tileTypeId: plainType!.id,
          copyIndex: 1,
        },
      ],
      { returning: true },
    );
    await GameTilePlacement.bulkCreate([
      {
        gameTileId: tiles[0]!.id,
        gameNodeId: null,
        gameTeamId: participant.gameTeamId,
        slotIndex: null,
      },
      {
        gameTileId: tiles[1]!.id,
        gameNodeId: null,
        gameTeamId: participant.gameTeamId,
        slotIndex: null,
      },
    ]);

    const offProjection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(offProjection.handTiles.every((t) => t.isRedFive === false)).toBe(
      true,
    );

    await GameRuleFlag.create({
      gameId: fixture.gameId,
      ruleKey: RED_FIVES_RULE_KEY,
      enabled: true,
    });

    const onProjection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    const redInstance = onProjection.handTiles.find(
      (t) => t.instanceId === tiles[0]!.id,
    )!;
    const plainInstance = onProjection.handTiles.find(
      (t) => t.instanceId === tiles[1]!.id,
    )!;
    expect(redInstance.isRedFive).toBe(true);
    expect(plainInstance.isRedFive).toBe(false);
  });

  it("multi-slot map: hides slots whose slotMapUnlockOffsetsSeconds[k] is null", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      nodeTilesByCode: { a: 2 },
      slotsPerNode: 2,
      // Phase L: null = "never on the map", subsumes the legacy
      // `slot_map_visible[k] = false` semantics.
      slotMapUnlockOffsetsSeconds: [0, null],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    await seedFaceUp(participant.gameTeamId, [aId]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    const aNode = projection.mapNodes.find((n) => n.code === "a")!;
    expect(aNode.tile).toBeUndefined();
    expect(aNode.tiles).toHaveLength(1);
    expect(aNode.tiles![0]!.slotIndex).toBe(0);
    expect(aNode.tiles![0]!.tile.instanceId).toBe(
      fixture.nodeTiles.find((t) => t.slotIndex === 0)!.gameTileId,
    );
  });

  it("multi-slot atStation: reveals every tile at the checked-in station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      startNodeCodeBySlot: { 1: "a" },
      nodeTilesByCode: { a: 2 },
      slotsPerNode: 2,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 60 * 60],
    });
    const participant = fixture.participants[0]!;
    const slot0Id = fixture.nodeTiles.find((t) => t.slotIndex === 0)!.gameTileId;
    const slot1Id = fixture.nodeTiles.find((t) => t.slotIndex === 1)!.gameTileId;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
      { now: new Date() },
    );
    expect(projection.atStation?.tiles).toHaveLength(2);
    expect(projection.atStation?.tiles?.map((e) => e.slotIndex)).toEqual([0, 1]);
    expect(projection.atStation?.tiles?.map((e) => e.tile.instanceId)).toEqual([
      slot0Id,
      slot1Id,
    ]);
    // Map still respects slot unlock times.
    expect(
      projection.mapNodes.find((n) => n.code === "a")!.tiles?.map((t) => t.slotIndex),
    ).toEqual([0]);
  });

  it("nextVisibilityChangeAt: surfaces the earliest pending VISIBILITY_PHASE_ADVANCE runAt", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;

    const empty = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(empty.nextVisibilityChangeAt).toBeNull();

    const earlier = new Date(Date.now() + 60 * 1000);
    const later = new Date(Date.now() + 120 * 1000);
    await GameScheduledJob.bulkCreate([
      {
        gameId: fixture.gameId,
        jobType: "VISIBILITY_PHASE_ADVANCE",
        runAt: later,
        status: "pending",
        payload: { phase: 2 },
      },
      {
        gameId: fixture.gameId,
        jobType: "VISIBILITY_PHASE_ADVANCE",
        runAt: earlier,
        status: "pending",
        payload: { phase: 1 },
      },
      {
        gameId: fixture.gameId,
        jobType: "VISIBILITY_PHASE_ADVANCE",
        runAt: new Date(Date.now() - 1000),
        status: "done",
        payload: { phase: 0 },
      },
    ]);

    const populated = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(populated.nextVisibilityChangeAt).toBe(earlier.toISOString());
  });

  it("recentEvents: returns events ordered by sequence ASC with team codes and lifted payload fields", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const sequelize = await getSequelize();

    await sequelize.transaction(async (tx) => {
      await appendEvent(tx, {
        gameId: fixture.gameId,
        eventType: "CHECK_IN",
        actorGameTeamId: participant.gameTeamId,
        actorUserId: participant.userId,
        payload: { nodeCode: "a", nodeId: "ignored-uuid", hasPhoto: true },
      });
      await appendEvent(tx, {
        gameId: fixture.gameId,
        eventType: "VISIBILITY_PHASE_ADVANCED",
        payload: { previousPhase: 0, phase: 1 },
      });
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.recentEvents).toHaveLength(2);
    expect(projection.recentEvents.map((e) => e.sequence)).toEqual([1, 2]);

    const first = projection.recentEvents[0]!;
    expect(first.type).toBe("CHECK_IN");
    expect(first.teamCode).not.toBeNull();
    expect(first.nodeCode).toBe("a");
    expect(first.hasPhoto).toBe(true);
    expect(first.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = projection.recentEvents[1]!;
    expect(second.type).toBe("VISIBILITY_PHASE_ADVANCED");
    expect(second.teamCode).toBeNull();
    expect(second.phase).toBe(1);
    expect(second.nodeCode).toBeUndefined();
  });

  it("recentEvents: lifts geolocationWarning from CHECK_IN payloads (Phase F) and omits it when absent", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const sequelize = await getSequelize();

    await sequelize.transaction(async (tx) => {
      await appendEvent(tx, {
        gameId: fixture.gameId,
        eventType: "CHECK_IN",
        actorGameTeamId: participant.gameTeamId,
        actorUserId: participant.userId,
        payload: {
          nodeCode: "a",
          geolocationWarning: true,
          geofenceValidated: false,
          distanceMeters: 230,
        },
      });
      await appendEvent(tx, {
        gameId: fixture.gameId,
        eventType: "CHECK_IN",
        actorGameTeamId: participant.gameTeamId,
        actorUserId: participant.userId,
        // No geolocationWarning on the second event — the no-geo back-compat
        // path. The DTO must omit the field entirely so the client doesn't
        // see a spurious `false`.
        payload: { nodeCode: "b" },
      });
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    const [warned, plain] = projection.recentEvents;
    expect(warned?.geolocationWarning).toBe(true);
    expect(plain?.geolocationWarning).toBeUndefined();
    // distanceMeters/geofenceValidated stay in the raw payload but are
    // intentionally NOT lifted into the DTO — the client only needs the
    // boolean for the warning badge.
    expect(
      (warned as unknown as { distanceMeters?: number }).distanceMeters,
    ).toBeUndefined();
    expect(
      (warned as unknown as { geofenceValidated?: boolean })
        .geofenceValidated,
    ).toBeUndefined();
  });

  it("recentEvents: surfaces SLOT_UNLOCKED events with their slotIndex", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const sequelize = await getSequelize();

    await sequelize.transaction(async (tx) => {
      await appendEvent(tx, {
        gameId: fixture.gameId,
        eventType: "SLOT_UNLOCKED",
        payload: { slotIndex: 1 },
      });
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.recentEvents).toHaveLength(1);
    const event = projection.recentEvents[0]!;
    expect(event.type).toBe("SLOT_UNLOCKED");
    expect(event.slotIndex).toBe(1);
    expect(event.teamCode).toBeNull();
  });

  // ------------------------------------------------------------------
  // Phase I — scoring projection wiring
  // ------------------------------------------------------------------

  /** Place `tiles` (described as `[suit, rank, copyIndex]` triples) into the
   *  given team's hand by minting fresh `game_tile` + `game_tile_placement`
   *  rows pointing at the matching `tile_types` row. */
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

  it("handAnalysis: omitted when the hand isn't 13 or 14 tiles", async () => {
    const fixture = await setupLightweightGame({
      handTilesBySlot: { 1: 8 }, // 8 tiles — outside the scoring window
    });
    const participant = fixture.participants[0]!;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.handTiles).toHaveLength(8);
    expect(projection.handAnalysis).toBeUndefined();
  });

  it("handAnalysis: tenpai shanpon hand returns shanten 0 + scored waits", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    // 234m 234p 234s 55p 88p (13 tiles) — shanpon tenpai on 5p / 8p.
    // 4-han + sanshoku-doujun + iipeikou-free shape; tanyao fires.
    await placeHandTiles(fixture.gameId, participant.gameTeamId, [
      ["man", 2, 0], ["man", 3, 0], ["man", 4, 0],
      ["pin", 2, 0], ["pin", 3, 0], ["pin", 4, 0],
      ["sou", 2, 0], ["sou", 3, 0], ["sou", 4, 0],
      ["pin", 5, 1], ["pin", 5, 2], // skip copyIndex 0 (red five)
      ["pin", 8, 0], ["pin", 8, 1],
    ]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.handTiles).toHaveLength(13);
    expect(projection.handAnalysis).toBeDefined();
    expect(projection.handAnalysis!.shanten).toBe(0);
    expect(projection.handAnalysis!.waits).toBeDefined();
    expect(projection.handAnalysis!.waits!).toHaveLength(2);
    for (const w of projection.handAnalysis!.waits!) {
      expect(w.han).toBeGreaterThanOrEqual(3);
      expect(w.points).toBeGreaterThan(0);
      expect(w.isYakuman).toBe(false);
      const names = w.yaku.map((y) => y.name);
      expect(names).toContain("All Simples");
      expect(names).toContain("Three Colour Straight");
    }
    const waitRanks = projection.handAnalysis!.waits!
      .map((w) => w.tile.rank)
      .sort();
    expect(waitRanks).toEqual([5, 8]);
  });

  it("handAnalysis: iishanten hand reports shanten 1 with no waits", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    // 234m 234p 234s 55p 1p 9p — 3 sets + 1 pair + 2 isolated floaters.
    // Neither 1p nor 9p is adjacent to another live tile so they don't form
    // a partial; the hand needs one more useful tile to reach tenpai
    // (e.g. drawing a 1p or 9p to make a second pair → shanpon tenpai).
    await placeHandTiles(fixture.gameId, participant.gameTeamId, [
      ["man", 2, 0], ["man", 3, 0], ["man", 4, 0],
      ["pin", 2, 0], ["pin", 3, 0], ["pin", 4, 0],
      ["sou", 2, 0], ["sou", 3, 0], ["sou", 4, 0],
      ["pin", 5, 1], ["pin", 5, 2],
      ["wind", 4, 0], ["dragon", 1, 0],
    ]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.handTiles).toHaveLength(13);
    expect(projection.handAnalysis).toBeDefined();
    expect(projection.handAnalysis!.shanten).toBeGreaterThanOrEqual(1);
    expect(projection.handAnalysis!.waits).toBeUndefined();
  });

  it("handAnalysis: exposes roundWind and seatWind", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    // Lightweight fixture omits `roundWind`; the column default is 1 (East).
    expect(projection.roundWind).toBe(1);
    // First participant is on team slot 1 — east.
    expect(projection.seatWind).toBe(1);
  });

  // ------------------------------------------------------------------
  // Dead wall + dora indicator (chunk 3)
  // ------------------------------------------------------------------

  /** Mint a `game_tile` + dead-wall `game_tile_placement` at the supplied
   *  `dead_wall_index`. Mirrors `placeHandTiles` but targets the dead-wall
   *  branch of the tri-state placement CHECK. */
  async function placeDeadWallTile(
    gameId: string,
    deadWallIndex: number,
    tile: readonly [string, number, number],
  ): Promise<string> {
    const [suit, rank, copyIndex] = tile;
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
      gameTeamId: null,
      slotIndex: null,
      deadWallIndex,
    });
    return gameTile.id;
  }

  it("doraIndicator: null when no dead-wall placement exists", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.doraIndicator).toBeNull();
  });

  it("doraIndicator: exposes the dead-wall tile at index 0 as a TileDto", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const indicatorTileId = await placeDeadWallTile(fixture.gameId, 0, [
      "pin", 1, 0,
    ]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.doraIndicator).not.toBeNull();
    expect(projection.doraIndicator!.instanceId).toBe(indicatorTileId);
    expect(projection.doraIndicator!.suit).toBe("pin");
    expect(projection.doraIndicator!.rank).toBe(1);
  });

  it("doraIndicator: ignores dead-wall tiles parked at non-zero indices", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    // Park a tile at dead_wall_index = 1 only (no index 0). The projection
    // exposes only the index-0 slot — extra dead-wall tiles are part of
    // the (kan / replacement) tail and aren't surfaced as dora.
    await placeDeadWallTile(fixture.gameId, 1, ["man", 5, 1]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.doraIndicator).toBeNull();
  });

  it("handAnalysis: dora indicator threads through to scoring (+1 han per matching tile)", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    // Same shanpon tenpai as the no-dora test: 234m 234p 234s 55p 88p.
    // Indicator 1p → dora 2p; the hand has exactly one 2p (from 234p),
    // so each wait gains +1 han.
    await placeHandTiles(fixture.gameId, participant.gameTeamId, [
      ["man", 2, 0], ["man", 3, 0], ["man", 4, 0],
      ["pin", 2, 0], ["pin", 3, 0], ["pin", 4, 0],
      ["sou", 2, 0], ["sou", 3, 0], ["sou", 4, 0],
      ["pin", 5, 1], ["pin", 5, 2],
      ["pin", 8, 0], ["pin", 8, 1],
    ]);
    await placeDeadWallTile(fixture.gameId, 0, ["pin", 1, 0]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.doraIndicator?.suit).toBe("pin");
    expect(projection.doraIndicator?.rank).toBe(1);
    expect(projection.handAnalysis).toBeDefined();
    expect(projection.handAnalysis!.shanten).toBe(0);
    for (const w of projection.handAnalysis!.waits!) {
      // Base 3 han (tanyao + sanshoku) + 1 dora = 4 han.
      expect(w.han).toBe(4);
      const doraEntry = w.yaku.find((y) => y.name === "Dora");
      expect(doraEntry).toBeDefined();
      expect(doraEntry!.han).toBe(1);
    }
  });

  it("handAnalysis: dora cycle wraps for honour indicators (Green dragon → Red dragon)", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    // Big Three Dragons-adjacent shape but with one missing dragon meld so
    // we hit the normal scoring path rather than the yakuman (which would
    // skip dora). 111d (red) 234m 234p 234s 88p — wait on 8p tanki.
    // Indicator Green dragon (rank 3) → Red dragon (rank 1). The hand has
    // three red-dragon tiles, so each wait gains +3 dora.
    await placeHandTiles(fixture.gameId, participant.gameTeamId, [
      ["dragon", 1, 0], ["dragon", 1, 1], ["dragon", 1, 2],
      ["man", 2, 0], ["man", 3, 0], ["man", 4, 0],
      ["pin", 2, 0], ["pin", 3, 0], ["pin", 4, 0],
      ["sou", 2, 0], ["sou", 3, 0], ["sou", 4, 0],
      ["pin", 8, 0],
    ]);
    await placeDeadWallTile(fixture.gameId, 0, ["dragon", 3, 0]);

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.doraIndicator?.suit).toBe("dragon");
    expect(projection.doraIndicator?.rank).toBe(3);
    expect(projection.handAnalysis).toBeDefined();
    expect(projection.handAnalysis!.shanten).toBe(0);
    const wait = projection.handAnalysis!.waits!.find(
      (w) => w.tile.suit === "pin" && w.tile.rank === 8,
    );
    expect(wait).toBeDefined();
    expect(wait!.isYakuman).toBe(false);
    const doraEntry = wait!.yaku.find((y) => y.name === "Dora");
    expect(doraEntry).toBeDefined();
    expect(doraEntry!.han).toBe(3);
  });
});
