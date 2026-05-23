import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { swapPlacements } from "../../../src/engine/tile-swap-service.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { setupStartedGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("swapPlacements", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("exchanges targets between a hand placement and a node placement", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const team = fixture.participants[0]!.gameTeamId;

    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: team },
    });
    const nodePlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: null },
    });
    if (!handPlacement || !nodePlacement) {
      throw new Error("expected hand and node placements after game start");
    }
    const originalNodeId = nodePlacement.gameNodeId;
    expect(handPlacement.gameNodeId).toBeNull();
    expect(originalNodeId).not.toBeNull();

    const sequelize = await getSequelize();
    await sequelize.transaction((tx) =>
      swapPlacements(
        tx,
        handPlacement.gameTileId,
        nodePlacement.gameTileId,
      ),
    );

    const [refreshedHand, refreshedNode] = await Promise.all([
      GameTilePlacement.findOne({
        where: { gameTileId: handPlacement.gameTileId },
      }),
      GameTilePlacement.findOne({
        where: { gameTileId: nodePlacement.gameTileId },
      }),
    ]);
    expect(refreshedHand?.gameTeamId).toBeNull();
    expect(refreshedHand?.gameNodeId).toBe(originalNodeId);
    expect(refreshedNode?.gameTeamId).toBe(team);
    expect(refreshedNode?.gameNodeId).toBeNull();
  });

  it("exchanges targets between two node placements without unique-index collision", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });

    const [first, second] = await GameTilePlacement.findAll({
      where: { gameTeamId: null },
      limit: 2,
      order: [["gameNodeId", "ASC"]],
    });
    if (!first || !second) {
      throw new Error("expected at least two node placements");
    }
    const firstNodeId = first.gameNodeId;
    const secondNodeId = second.gameNodeId;
    expect(firstNodeId).not.toBe(secondNodeId);

    const sequelize = await getSequelize();
    await sequelize.transaction((tx) =>
      swapPlacements(tx, first.gameTileId, second.gameTileId),
    );

    const [refreshedFirst, refreshedSecond] = await Promise.all([
      GameTilePlacement.findOne({
        where: { gameTileId: first.gameTileId },
      }),
      GameTilePlacement.findOne({
        where: { gameTileId: second.gameTileId },
      }),
    ]);
    expect(refreshedFirst?.gameNodeId).toBe(secondNodeId);
    expect(refreshedSecond?.gameNodeId).toBe(firstNodeId);
    expect(refreshedFirst?.gameTeamId).toBeNull();
    expect(refreshedSecond?.gameTeamId).toBeNull();
  });

  it("preserves placement counts (no tiles created or destroyed)", async () => {
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
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const realPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: fixture.participants[0]!.gameTeamId },
    });
    const sequelize = await getSequelize();

    await expect(
      sequelize.transaction((tx) =>
        swapPlacements(tx, realPlacement!.gameTileId, randomUUID()),
      ),
    ).rejects.toMatchObject({ status: 404, code: "tile_not_found" });
  });

  it("rejects swapping a tile with itself", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const placement = await GameTilePlacement.findOne({
      where: { gameTeamId: fixture.participants[0]!.gameTeamId },
    });
    const sequelize = await getSequelize();

    await expect(
      sequelize.transaction((tx) =>
        swapPlacements(tx, placement!.gameTileId, placement!.gameTileId),
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_swap" });
  });
});
