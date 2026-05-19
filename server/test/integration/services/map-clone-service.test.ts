import { beforeEach, describe, expect, it } from "vitest";
import { cloneMapTemplateToGame } from "../../../src/services/map-clone-service.ts";
import { GameEdge } from "../../../src/models/game-edge.ts";
import { GameLine } from "../../../src/models/game-line.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameNodeLine } from "../../../src/models/game-node-line.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { withGameShell } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("cloneMapTemplateToGame", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("clones 84 nodes with lines and edges from the template", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await cloneMapTemplateToGame(shell.gameId, shell.mapTemplateId, transaction);

      const nodeIds = (
        await GameNode.findAll({
          where: { gameId: shell.gameId },
          attributes: ["id"],
          transaction,
        })
      ).map((n) => n.id);

      const [nodeCount, lineCount, edgeCount, nodeLineCount] = await Promise.all([
        GameNode.count({ where: { gameId: shell.gameId }, transaction }),
        GameLine.count({ where: { gameId: shell.gameId }, transaction }),
        GameEdge.count({ where: { gameId: shell.gameId }, transaction }),
        GameNodeLine.count({ where: { gameNodeId: nodeIds }, transaction }),
      ]);

      expect(nodeCount).toBe(84);
      expect(lineCount).toBeGreaterThan(0);
      expect(edgeCount).toBeGreaterThan(0);
      expect(nodeLineCount).toBeGreaterThan(0);
    });
  });
});
