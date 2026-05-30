import { beforeEach, describe, expect, it } from "vitest";
import { dealTilesForGame } from "../../../src/services/tile-deal-service.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { MapTemplateNode } from "../../../src/models/map-template-node.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { createGameShell, createGameShellWithMap } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("dealTilesForGame", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("deals the default 84 * 1 + 13 * 4 = 136 tile configuration", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await dealTilesForGame(
        shell.gameId,
        shell.gameTeamIdBySlot,
        1,
        13,
        transaction,
      );

      const [tileCount, nodePlacements, teamPlacements] = await Promise.all([
        GameTile.count({ where: { gameId: shell.gameId }, transaction }),
        GameTilePlacement.count({
          where: { gameNodeId: shell.gameNodeIds },
          transaction,
        }),
        GameTilePlacement.count({
          where: { gameTeamId: [...shell.gameTeamIdBySlot.values()] },
          transaction,
        }),
      ]);

      expect(tileCount).toBe(136);
      expect(nodePlacements).toBe(84);
      expect(teamPlacements).toBe(52);

      // Each node has exactly 1 placement.
      for (const gameNodeId of shell.gameNodeIds) {
        const perNode = await GameTilePlacement.count({
          where: { gameNodeId },
          transaction,
        });
        expect(perNode).toBe(1);
      }
    });
  });

  it("deals a non-default 4 nodes × 8 slots + 26 × 4 = 136 configuration", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShell(lobbyId, transaction);

      // Borrow four template nodes as FK targets for a synthetic mini-map. We
      // don't go through map-clone-service here because the deal only needs
      // game_nodes rows to exist; it doesn't care how they got there.
      const templateNodes = await MapTemplateNode.findAll({
        where: { mapTemplateId: shell.mapTemplateId },
        order: [["code", "ASC"]],
        limit: 4,
        transaction,
      });
      expect(templateNodes).toHaveLength(4);

      const gameNodes = await GameNode.bulkCreate(
        templateNodes.map((tn, i) => ({
          gameId: shell.gameId,
          templateNodeId: tn.id,
          code: `mini-${i}`,
          name: tn.name,
          latitude: tn.latitude,
          longitude: tn.longitude,
          geofenceRadiusMeters: 100,
          coordinateX: tn.coordinateX,
          coordinateY: tn.coordinateY,
          labelAnchor: tn.labelAnchor,
          labelRotate: tn.labelRotate,
          isInterchange: tn.isInterchange,
        })),
        { transaction, returning: true },
      );
      const gameNodeIds = gameNodes.map((n) => n.id);

      // 4 × 8 + 26 × 4 = 32 + 104 = 136 (matches the seeded tile catalog).
      await dealTilesForGame(
        shell.gameId,
        shell.gameTeamIdBySlot,
        8,
        26,
        transaction,
      );

      const [tileCount, nodePlacements, teamPlacements] = await Promise.all([
        GameTile.count({ where: { gameId: shell.gameId }, transaction }),
        GameTilePlacement.count({
          where: { gameNodeId: gameNodeIds },
          transaction,
        }),
        GameTilePlacement.count({
          where: { gameTeamId: [...shell.gameTeamIdBySlot.values()] },
          transaction,
        }),
      ]);

      expect(tileCount).toBe(136);
      expect(nodePlacements).toBe(32);
      expect(teamPlacements).toBe(104);

      // Each node has exactly 8 placements (the configured slotsPerNode).
      for (const gameNodeId of gameNodeIds) {
        const perNode = await GameTilePlacement.count({
          where: { gameNodeId },
          transaction,
        });
        expect(perNode).toBe(8);
      }

      // Each team has exactly 26 placements.
      for (const gameTeamId of shell.gameTeamIdBySlot.values()) {
        const perTeam = await GameTilePlacement.count({
          where: { gameTeamId },
          transaction,
        });
        expect(perTeam).toBe(26);
      }
    });
  });

  it("rejects configurations that don't consume the full tile catalog", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      // 84 × 2 + 13 × 4 = 168 + 52 = 220 ≠ 136
      await expect(
        dealTilesForGame(
          shell.gameId,
          shell.gameTeamIdBySlot,
          2,
          13,
          transaction,
        ),
      ).rejects.toThrow(/catalog mismatch/i);
    });
  });

  it("rejects non-positive slotsPerNode / handSize", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);

      await expect(
        dealTilesForGame(
          shell.gameId,
          shell.gameTeamIdBySlot,
          0,
          13,
          transaction,
        ),
      ).rejects.toThrow(/slotsPerNode/);

      await expect(
        dealTilesForGame(
          shell.gameId,
          shell.gameTeamIdBySlot,
          1,
          0,
          transaction,
        ),
      ).rejects.toThrow(/handSize/);
    });
  });
});
