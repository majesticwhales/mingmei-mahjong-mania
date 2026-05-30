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

  it("creates three visibility advances and a game end job for the default 4-phase config", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        shell.gameId,
        shell.startedAt,
        shell.endsAt,
        shell.visibilityPhaseIntervalSeconds,
        4,
        [],
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

      const targetPhases = jobs
        .filter((j) => j.jobType === "VISIBILITY_PHASE_ADVANCE")
        .map((j) => (j.payload as { targetPhase: number }).targetPhase);
      expect(targetPhases).toEqual([1, 2, 3]);
    });
  });

  it("schedules only the game end when visibilityPhaseCount = 1", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        shell.gameId,
        shell.startedAt,
        shell.endsAt,
        shell.visibilityPhaseIntervalSeconds,
        1,
        [],
        transaction,
      );

      const jobs = await GameScheduledJob.findAll({
        where: { gameId: shell.gameId },
        order: [["runAt", "ASC"]],
        transaction,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.jobType).toBe("GAME_END");
      expect(jobs[0]!.runAt.getTime()).toBe(shell.endsAt.getTime());
    });
  });

  it("schedules (N - 1) advances for arbitrary phase counts", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        shell.gameId,
        shell.startedAt,
        shell.endsAt,
        shell.visibilityPhaseIntervalSeconds,
        6,
        [],
        transaction,
      );

      const advances = await GameScheduledJob.findAll({
        where: { gameId: shell.gameId, jobType: "VISIBILITY_PHASE_ADVANCE" },
        order: [["runAt", "ASC"]],
        transaction,
      });

      expect(advances).toHaveLength(5);
      const targetPhases = advances.map(
        (j) => (j.payload as { targetPhase: number }).targetPhase,
      );
      expect(targetPhases).toEqual([1, 2, 3, 4, 5]);

      const intervalMs = shell.visibilityPhaseIntervalSeconds * 1000;
      for (let i = 0; i < advances.length; i += 1) {
        expect(advances[i]!.runAt.getTime()).toBe(
          shell.startedAt.getTime() + intervalMs * (i + 1),
        );
      }
    });
  });

  it("rejects invalid visibilityPhaseCount", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await expect(
        scheduleGameJobs(
          shell.gameId,
          shell.startedAt,
          shell.endsAt,
          shell.visibilityPhaseIntervalSeconds,
          0,
          [],
          transaction,
        ),
      ).rejects.toThrow(/visibilityPhaseCount/);
    });
  });

  it("creates a NOTIFICATION job per entry with offset-based runAt and payload", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        shell.gameId,
        shell.startedAt,
        shell.endsAt,
        shell.visibilityPhaseIntervalSeconds,
        1,
        [
          { atSeconds: 0, template: "game_start", data: null },
          {
            atSeconds: 600,
            template: "time_warning",
            data: { minutesLeft: 10 },
          },
        ],
        transaction,
      );

      const notifications = await GameScheduledJob.findAll({
        where: { gameId: shell.gameId, jobType: "NOTIFICATION" },
        order: [["runAt", "ASC"]],
        transaction,
      });

      expect(notifications).toHaveLength(2);
      expect(notifications[0]!.runAt.getTime()).toBe(shell.startedAt.getTime());
      expect(notifications[0]!.payload).toEqual({
        template: "game_start",
        data: null,
      });
      expect(notifications[1]!.runAt.getTime()).toBe(
        shell.startedAt.getTime() + 600 * 1000,
      );
      expect(notifications[1]!.payload).toEqual({
        template: "time_warning",
        data: { minutesLeft: 10 },
      });
      expect(notifications.every((j) => j.status === "pending")).toBe(true);
    });
  });

  it("rejects notifications with negative atSeconds", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await expect(
        scheduleGameJobs(
          shell.gameId,
          shell.startedAt,
          shell.endsAt,
          shell.visibilityPhaseIntervalSeconds,
          1,
          [{ atSeconds: -1, template: "bad", data: null }],
          transaction,
        ),
      ).rejects.toThrow(/atSeconds/);
    });
  });
});
