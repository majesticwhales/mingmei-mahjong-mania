import { beforeEach, describe, expect, it } from "vitest";
import { scheduleGameJobs } from "../../../src/services/game-schedule-service.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { withGameShell } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("scheduleGameJobs", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("creates three visibility advances and a game end job", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        shell.gameId,
        shell.startedAt,
        shell.endsAt,
        shell.visibilityPhaseIntervalSeconds,
        transaction,
      );

      const jobs = await GameScheduledJob.findAll({
        where: { gameId: shell.gameId },
        order: [["runAt", "ASC"]],
        transaction,
      });

      expect(jobs).toHaveLength(4);
      expect(jobs.map((j) => j.jobType)).toEqual([
        "VISIBILITY_PHASE_ADVANCE",
        "VISIBILITY_PHASE_ADVANCE",
        "VISIBILITY_PHASE_ADVANCE",
        "GAME_END",
      ]);
      expect(jobs.every((j) => j.status === "pending")).toBe(true);

      const intervalMs = shell.visibilityPhaseIntervalSeconds * 1000;
      expect(jobs[0]!.runAt.getTime()).toBe(shell.startedAt.getTime() + intervalMs);
      expect(jobs[3]!.runAt.getTime()).toBe(shell.endsAt.getTime());
    });
  });
});
