import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { swapPlacements } from "../../../src/engine/tile-swap-service.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { setupLightweightGame, setupStartedGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("swapPlacements", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("exchanges targets between a hand placement and a node placement", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const team = fixture.participants[0]!.gameTeamId;
    const handTileId = fixture.handTiles[0]!.gameTileId;
    const stationTileId = fixture.nodeTiles[0]!.gameTileId;
    const originalNodeId = fixture.nodeTiles[0]!.nodeId;

    const sequelize = await getSequelize();
    await sequelize.transaction((tx) =>
      swapPlacements(tx, handTileId, stationTileId),
    );

    const [refreshedHand, refreshedNode] = await Promise.all([
      GameTilePlacement.findOne({ where: { gameTileId: handTileId } }),
      GameTilePlacement.findOne({ where: { gameTileId: stationTileId } }),
    ]);
    expect(refreshedHand?.gameTeamId).toBeNull();
    expect(refreshedHand?.gameNodeId).toBe(originalNodeId);
    expect(refreshedNode?.gameTeamId).toBe(team);
    expect(refreshedNode?.gameNodeId).toBeNull();
  });

  it("exchanges targets between two node placements without unique-index collision", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 0,
      nodeCodes: ["a", "b"],
      nodeTilesByCode: { a: 1, b: 1 },
    });
    const first = fixture.nodeTiles.find((t) => t.nodeCode === "a")!;
    const second = fixture.nodeTiles.find((t) => t.nodeCode === "b")!;

    const sequelize = await getSequelize();
    await sequelize.transaction((tx) =>
      swapPlacements(tx, first.gameTileId, second.gameTileId),
    );

    const [refreshedFirst, refreshedSecond] = await Promise.all([
      GameTilePlacement.findOne({ where: { gameTileId: first.gameTileId } }),
      GameTilePlacement.findOne({ where: { gameTileId: second.gameTileId } }),
    ]);
    expect(refreshedFirst?.gameNodeId).toBe(second.nodeId);
    expect(refreshedSecond?.gameNodeId).toBe(first.nodeId);
    expect(refreshedFirst?.gameTeamId).toBeNull();
    expect(refreshedSecond?.gameTeamId).toBeNull();
  });

  it("preserves placement counts (no tiles created or destroyed)", async () => {
    // Keeps `setupStartedGame` because this test asserts the full
    // 84-station + 4×13-hand deal-time invariant, which only the real
    // start flow produces.
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const team = fixture.participants[0]!.gameTeamId;

    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: team },
    });
    const nodePlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: null },
    });
    const sequelize = await getSequelize();
    await sequelize.transaction((tx) =>
      swapPlacements(tx, handPlacement!.gameTileId, nodePlacement!.gameTileId),
    );

    const [nodePlacements, handPlacements] = await Promise.all([
      GameTilePlacement.count({ where: { gameTeamId: null } }),
      GameTilePlacement.count({
        where: { gameNodeId: null },
      }),
    ]);
    expect(nodePlacements).toBe(84);
    expect(handPlacements).toBe(13 * 4);
  });

  it("rejects with tile_not_found when one tile id has no placement", async () => {
    const fixture = await setupLightweightGame({
      handTilesBySlot: { 1: 1 },
    });
    const sequelize = await getSequelize();

    await expect(
      sequelize.transaction((tx) =>
        swapPlacements(tx, fixture.handTiles[0]!.gameTileId, randomUUID()),
      ),
    ).rejects.toMatchObject({ status: 404, code: "tile_not_found" });
  });

  it("rejects swapping a tile with itself", async () => {
    const fixture = await setupLightweightGame({
      handTilesBySlot: { 1: 1 },
    });
    const sequelize = await getSequelize();
    const id = fixture.handTiles[0]!.gameTileId;

    await expect(
      sequelize.transaction((tx) => swapPlacements(tx, id, id)),
    ).rejects.toMatchObject({ status: 400, code: "invalid_swap" });
  });
});
