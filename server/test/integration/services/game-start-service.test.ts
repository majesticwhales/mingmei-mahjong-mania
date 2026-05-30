import { beforeEach, describe, expect, it } from "vitest";
import * as lobbyService from "../../../src/services/lobby-service.ts";
import * as notificationService from "../../../src/services/lobby-notification-service.ts";
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
    expect(game?.slotsPerNode).toBe(1);
    expect(game?.visibilityPhaseCount).toBe(4);
  });

  it("snapshots non-default slotsPerNode and visibilityPhaseCount from the lobby onto the game", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    // Pick a configuration that keeps the deal-time invariant satisfied
    // against the seeded 84-node / 136-tile catalog:
    //   slots = 1, visibilityPhases = 2 → still 84 × 1 + 13 × 4 = 136.
    // (slots > 1 against the 84-node template would fail tile-deal validation;
    // chunk 4 covers that path. Here we only care that the snapshot column
    // ends up on the Game.)
    await lobbyService.updateConfig(lobbyId, hostId, {
      visibilityPhaseCount: 2,
    });

    const result = await startFromLobby(lobbyId, hostId);
    const game = await Game.findByPk(result.gameId);

    expect(game?.slotsPerNode).toBe(1);
    expect(game?.visibilityPhaseCount).toBe(2);

    // With N = 2, scheduleGameJobs should produce one VISIBILITY_PHASE_ADVANCE
    // and one GAME_END.
    const jobs = await GameScheduledJob.findAll({
      where: { gameId: result.gameId },
      order: [["runAt", "ASC"]],
    });
    expect(jobs.map((j) => j.jobType)).toEqual([
      "VISIBILITY_PHASE_ADVANCE",
      "GAME_END",
    ]);
  });

  it("copies lobby_notifications into NOTIFICATION scheduled jobs at game start", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    await notificationService.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 0,
      template: "game_start",
    });
    await notificationService.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 600,
      template: "time_warning",
      data: { minutesLeft: 10 },
    });

    const result = await startFromLobby(lobbyId, hostId);
    const game = await Game.findByPk(result.gameId);
    expect(game).toBeTruthy();

    const notifJobs = await GameScheduledJob.findAll({
      where: { gameId: result.gameId, jobType: "NOTIFICATION" },
      order: [["runAt", "ASC"]],
    });

    expect(notifJobs).toHaveLength(2);
    expect(notifJobs[0]!.runAt.getTime()).toBe(game!.startedAt.getTime());
    expect(notifJobs[0]!.payload).toEqual({
      template: "game_start",
      data: null,
    });
    expect(notifJobs[1]!.runAt.getTime()).toBe(
      game!.startedAt.getTime() + 600 * 1000,
    );
    expect(notifJobs[1]!.payload).toEqual({
      template: "time_warning",
      data: { minutesLeft: 10 },
    });
  });
});
