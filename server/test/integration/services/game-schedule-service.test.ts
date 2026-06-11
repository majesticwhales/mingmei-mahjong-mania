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
          slotMapUnlockOffsetsSeconds: [0],
          notifications: [],
          visibilityMode: "both",
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
          slotMapUnlockOffsetsSeconds: [0],
          notifications: [],
          visibilityMode: "both",
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
          slotMapUnlockOffsetsSeconds: [0],
          notifications: [],
          visibilityMode: "both",
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
            slotMapUnlockOffsetsSeconds: [0],
            notifications: [],
            visibilityMode: "both",
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
          slotMapUnlockOffsetsSeconds: [0],
          notifications: [
            { atSeconds: 0, template: "game_start", data: null },
            {
              atSeconds: 600,
              template: "time_warning",
              data: { minutesLeft: 10 },
            },
          ],
          visibilityMode: "both",
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
            slotMapUnlockOffsetsSeconds: [0],
            notifications: [{ atSeconds: -1, template: "bad", data: null }],
            visibilityMode: "both",
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
        // slot 2 unlocks at +900s. Map offsets match claim — exercises
        // the SLOT_MAP_UNLOCKED dedupe path (no map job seeded when the
        // timer coincides with claim).
        await scheduleGameJobs(
          {
            gameId: shell.gameId,
            startedAt: shell.startedAt,
            endsAt: shell.endsAt,
            visibilityPhaseIntervalSeconds:
              shell.visibilityPhaseIntervalSeconds,
            visibilityPhaseCount: 1,
            slotUnlockOffsetsSeconds: [0, 300, 900],
            slotMapUnlockOffsetsSeconds: [0, 300, 900],
            notifications: [],
            visibilityMode: "both",
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

        // Coincident map offsets dedupe to a single SLOT_UNLOCKED event.
        const mapUnlocks = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_MAP_UNLOCKED" },
          transaction,
        });
        expect(mapUnlocks).toHaveLength(0);
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
            slotMapUnlockOffsetsSeconds: [0, 0, 120],
            notifications: [],
            visibilityMode: "both",
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
              slotMapUnlockOffsetsSeconds: [60, 0],
              notifications: [],
              visibilityMode: "both",
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
              slotMapUnlockOffsetsSeconds: [0, 0],
              notifications: [],
              visibilityMode: "both",
            },
            transaction,
          ),
        ).rejects.toThrow(/slotUnlockOffsetsSeconds\[1\]/);
      });
    });
  });

  describe("SLOT_MAP_UNLOCKED jobs (Phase L §3.13)", () => {
    it("seeds a SLOT_MAP_UNLOCKED job per slot whose map offset differs from the claim offset", async () => {
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
            // Tier-2 (slot 1): claim immediately, map at 3600s.
            // Tier-3 (slot 2): claim at 3600s, map at 7200s.
            slotUnlockOffsetsSeconds: [0, 0, 3600],
            slotMapUnlockOffsetsSeconds: [0, 3600, 7200],
            notifications: [],
            visibilityMode: "both",
          },
          transaction,
        );

        const claimJobs = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_UNLOCKED" },
          order: [["runAt", "ASC"]],
          transaction,
        });
        // Slot 1 claim is at t=0 (skipped); slot 2 claim at 3600s.
        expect(claimJobs).toHaveLength(1);
        expect(claimJobs[0]!.payload).toEqual({ slotIndex: 2 });

        const mapJobs = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_MAP_UNLOCKED" },
          order: [["runAt", "ASC"]],
          transaction,
        });
        // Slot 1 map at 3600s; slot 2 map at 7200s (differs from claim).
        expect(mapJobs).toHaveLength(2);
        expect(mapJobs[0]!.payload).toEqual({ slotIndex: 1 });
        expect(mapJobs[0]!.runAt.getTime()).toBe(
          shell.startedAt.getTime() + 3600 * 1000,
        );
        expect(mapJobs[1]!.payload).toEqual({ slotIndex: 2 });
        expect(mapJobs[1]!.runAt.getTime()).toBe(
          shell.startedAt.getTime() + 7200 * 1000,
        );
      });
    });

    it("skips slots whose map offset is null (never on map)", async () => {
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
            slotUnlockOffsetsSeconds: [0, 60, 120],
            slotMapUnlockOffsetsSeconds: [0, null, 240],
            notifications: [],
            visibilityMode: "both",
          },
          transaction,
        );

        const mapJobs = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId, jobType: "SLOT_MAP_UNLOCKED" },
          transaction,
        });
        expect(mapJobs).toHaveLength(1);
        expect(mapJobs[0]!.payload).toEqual({ slotIndex: 2 });
      });
    });

    it("rejects slot 0 with a non-zero map offset", async () => {
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
              slotUnlockOffsetsSeconds: [0, 0],
              slotMapUnlockOffsetsSeconds: [60, 60],
              notifications: [],
              visibilityMode: "both",
            },
            transaction,
          ),
        ).rejects.toThrow(/slotMapUnlockOffsetsSeconds\[0\]/);
      });
    });

    it("rejects a map offset that precedes the claim offset", async () => {
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
              slotUnlockOffsetsSeconds: [0, 600],
              slotMapUnlockOffsetsSeconds: [0, 300],
              notifications: [],
              visibilityMode: "both",
            },
            transaction,
          ),
        ).rejects.toThrow(/slotMapUnlockOffsetsSeconds\[1\]/);
      });
    });
  });

  describe("visibility mode gating (chunk 3)", () => {
    it("skips VISIBILITY_PHASE_ADVANCE jobs when mode is 'slot' (phase off)", async () => {
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
            visibilityPhaseCount: 4,
            slotUnlockOffsetsSeconds: [0, 60],
            slotMapUnlockOffsetsSeconds: [0, 60],
            notifications: [],
            visibilityMode: "slot",
          },
          transaction,
        );

        const byType = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId },
          transaction,
        });
        const types = byType.map((j) => j.jobType).sort();
        expect(types).toEqual(["GAME_END", "SLOT_UNLOCKED"]);
      });
    });

    it("skips SLOT_UNLOCKED / SLOT_MAP_UNLOCKED jobs when mode is 'phase' (slot off)", async () => {
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
            visibilityPhaseCount: 3,
            // Non-zero offsets at k>0 would normally each emit a job;
            // the slot gate skips them entirely.
            slotUnlockOffsetsSeconds: [0, 30, 90],
            slotMapUnlockOffsetsSeconds: [0, 60, 120],
            notifications: [],
            visibilityMode: "phase",
          },
          transaction,
        );

        const byType = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId },
          transaction,
        });
        const counts = new Map<string, number>();
        for (const j of byType) {
          counts.set(j.jobType, (counts.get(j.jobType) ?? 0) + 1);
        }
        expect(counts.get("SLOT_UNLOCKED") ?? 0).toBe(0);
        expect(counts.get("SLOT_MAP_UNLOCKED") ?? 0).toBe(0);
        expect(counts.get("VISIBILITY_PHASE_ADVANCE") ?? 0).toBe(2);
        expect(counts.get("GAME_END") ?? 0).toBe(1);
      });
    });

    it("seeds only GAME_END (and notifications) when mode is 'none'", async () => {
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
            visibilityPhaseCount: 4,
            slotUnlockOffsetsSeconds: [0, 30],
            slotMapUnlockOffsetsSeconds: [0, 30],
            notifications: [
              { atSeconds: 60, template: "tick", data: null },
            ],
            visibilityMode: "none",
          },
          transaction,
        );

        const byType = await GameScheduledJob.findAll({
          where: { gameId: shell.gameId },
          transaction,
        });
        const types = byType.map((j) => j.jobType).sort();
        expect(types).toEqual(["GAME_END", "NOTIFICATION"]);
      });
    });
  });
});
