import { beforeEach, describe, expect, it } from "vitest";
import { dealTilesForGame } from "../../../src/services/tile-deal-service.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { createGameShellWithMap } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("dealTilesForGame", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("creates 136 tiles with 84 on the map and 13 per team", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await dealTilesForGame(shell.gameId, shell.gameTeamIdBySlot, transaction);

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
    });
  });
});
