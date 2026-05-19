import { beforeEach, describe, expect, it } from "vitest";
import { startFromLobby } from "../../../src/services/game-start-service.ts";
import { Game } from "../../../src/models/game.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { Lobby } from "../../../src/models/lobby.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("startFromLobby", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  // will update this as the phases progress
  it("bootstraps a full Phase C game from a ready lobby", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();

    const result = await startFromLobby(lobbyId, hostId);

    expect(result.status).toBe("active");

    const [lobby, tileCount, nodeCount, jobCount] = await Promise.all([
      Lobby.findByPk(lobbyId),
      GameTile.count({ where: { gameId: result.gameId } }),
      GameNode.count({ where: { gameId: result.gameId } }),
      GameScheduledJob.count({ where: { gameId: result.gameId } }),
    ]);

    expect(lobby?.status).toBe("closed");
    expect(tileCount).toBe(136);
    expect(nodeCount).toBe(84);
    expect(jobCount).toBe(4);

    const game = await Game.findByPk(result.gameId);
    expect(game?.status).toBe("active");
  });
});
