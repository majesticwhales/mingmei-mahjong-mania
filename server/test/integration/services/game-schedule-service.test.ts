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
        {
          gameId: shell.gameId,
          startedAt: shell.startedAt,
          endsAt: shell.endsAt,
          visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
          visibilityPhaseCount: 4,
          slotUnlockOffsetsSeconds: [0],
          notifications: [],
        },
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
        {
          gameId: shell.gameId,
          startedAt: shell.startedAt,
          endsAt: shell.endsAt,
          visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
          visibilityPhaseCount: 1,
          slotUnlockOffsetsSeconds: [0],
          notifications: [],
        },
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
        {
          gameId: shell.gameId,
          startedAt: shell.startedAt,
          endsAt: shell.endsAt,
          visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
          visibilityPhaseCount: 6,
          slotUnlockOffsetsSeconds: [0],
          notifications: [],
        },
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
          {
            gameId: shell.gameId,
            startedAt: shell.startedAt,
            endsAt: shell.endsAt,
            visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
            visibilityPhaseCount: 0,
            slotUnlockOffsetsSeconds: [0],
            notifications: [],
          },
          transaction,
        ),
      ).rejects.toThrow(/visibilityPhaseCount/);
    });
  });

  it("creates a NOTIFICATION job per entry with offset-based runAt and payload", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      await scheduleGameJobs(
        {
          gameId: shell.gameId,
          startedAt: shell.startedAt,
          endsAt: shell.endsAt,
          visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
          visibilityPhaseCount: 1,
          slotUnlockOffsetsSeconds: [0],
          notifications: [
            { atSeconds: 0, template: "game_start", data: null },
            {
              atSeconds: 600,
              template: "time_warning",
              data: { minutesLeft: 10 },
            },
          ],
        },
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
          {
            gameId: shell.gameId,
            startedAt: shell.startedAt,
            endsAt: shell.endsAt,
            visibilityPhaseIntervalSeconds: shell.visibilityPhaseIntervalSeconds,
            visibilityPhaseCount: 1,
            slotUnlockOffsetsSeconds: [0],
            notifications: [{ atSeconds: -1, template: "bad", data: null }],
          },
          transaction,
        ),
      ).rejects.toThrow(/atSeconds/);
    });
  });

  describe("SLOT_UNLOCKED jobs (per-slot rules chunk 4)", () => {
    it("seeds one SLOT_UNLOCKED job per non-zero offset (slot 0 always skipped)", async () => {
      const { lobbyId } = await createLobbyWithFourPlayers({
        assignTeams: false,
      });

      await withGameShell(lobbyId, async (shell, transaction) => {
        // Three slots: slot 0 always 0, slot 1 unlocks at +300s,
        // slot 2 unlocks at +900s.
        await scheduleGameJobs(
          {
            gameId: shell.gameId,
            startedAt: shell.startedAt,
            endsAt: shell.endsAt,
            visibilityPhaseIntervalSeconds:
              shell.visibilityPhaseIntervalSeconds,
            visibilityPhaseCount: 1,
            slotUnlockOffsetsSeconds: [0, 300, 900],
            notifications: [],
          },
          transaction,
        );

        const unlocks = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_UNLOCKED" },
          order: [["runAt", "ASC"]],
          transaction,
        });

        expect(unlocks).toHaveLength(2);
        expect(unlocks[0]!.payload).toEqual({ slotIndex: 1 });
        expect(unlocks[0]!.runAt.getTime()).toBe(
          shell.startedAt.getTime() + 300 * 1000,
        );
        expect(unlocks[1]!.payload).toEqual({ slotIndex: 2 });
        expect(unlocks[1]!.runAt.getTime()).toBe(
          shell.startedAt.getTime() + 900 * 1000,
        );
      });
    });

    it("skips slots whose offset is 0 (treated as 'unlocked at game start')", async () => {
      const { lobbyId } = await createLobbyWithFourPlayers({
        assignTeams: false,
      });

      await withGameShell(lobbyId, async (shell, transaction) => {
        await scheduleGameJobs(
          {
            gameId: shell.gameId,
            startedAt: shell.startedAt,
            endsAt: shell.endsAt,
            visibilityPhaseIntervalSeconds:
              shell.visibilityPhaseIntervalSeconds,
            visibilityPhaseCount: 1,
            slotUnlockOffsetsSeconds: [0, 0, 120],
            notifications: [],
          },
          transaction,
        );

        const unlocks = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_UNLOCKED" },
          transaction,
        });
        expect(unlocks).toHaveLength(1);
        expect(unlocks[0]!.payload).toEqual({ slotIndex: 2 });
      });
    });

    it("rejects slot 0 with a non-zero offset", async () => {
      const { lobbyId } = await createLobbyWithFourPlayers({
        assignTeams: false,
      });

      await withGameShell(lobbyId, async (shell, transaction) => {
        await expect(
          scheduleGameJobs(
            {
              gameId: shell.gameId,
              startedAt: shell.startedAt,
              endsAt: shell.endsAt,
              visibilityPhaseIntervalSeconds:
                shell.visibilityPhaseIntervalSeconds,
              visibilityPhaseCount: 1,
              slotUnlockOffsetsSeconds: [60, 0],
              notifications: [],
            },
            transaction,
          ),
        ).rejects.toThrow(/slotUnlockOffsetsSeconds\[0\]/);
      });
    });

    it("rejects a negative offset", async () => {
      const { lobbyId } = await createLobbyWithFourPlayers({
        assignTeams: false,
      });

      await withGameShell(lobbyId, async (shell, transaction) => {
        await expect(
          scheduleGameJobs(
            {
              gameId: shell.gameId,
              startedAt: shell.startedAt,
              endsAt: shell.endsAt,
              visibilityPhaseIntervalSeconds:
                shell.visibilityPhaseIntervalSeconds,
              visibilityPhaseCount: 1,
              slotUnlockOffsetsSeconds: [0, -10],
              notifications: [],
            },
            transaction,
          ),
        ).rejects.toThrow(/slotUnlockOffsetsSeconds\[1\]/);
      });
    });
  });
});
