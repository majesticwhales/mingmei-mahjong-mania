import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRODUCTION_LOBBY_PRESET } from "../../../src/game/lobby-presets.ts";
import * as lobbyService from "../../../src/services/lobby-service.ts";
import * as notificationService from "../../../src/services/lobby-notification-service.ts";
import { startFromLobby } from "../../../src/services/game-start-service.ts";
import { Game } from "../../../src/models/game.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameParticipant } from "../../../src/models/game-participant.ts";
import { GameNodeChallenge } from "../../../src/models/game-node-challenge.ts";
import { GameNodeVisibilityGroup } from "../../../src/models/game-node-visibility-group.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameRuleFlag } from "../../../src/models/game-rule-flag.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { GameTeam } from "../../../src/models/game-team.ts";
import { TeamDefinition } from "../../../src/models/team-definition.ts";
import { GameTeamHomeGroup } from "../../../src/models/game-team-home-group.ts";
import { GameTeamPosition } from "../../../src/models/game-team-position.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { Lobby } from "../../../src/models/lobby.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { registerUser, setUserAdmin } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("startFromLobby", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  afterEach(async () => {
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
    // Production preset (14400s, 3 phases, 3 time_warning notifications,
    // visibilityMode "both") with tier-aligned slot offsets
    // (TDD §3.3 — claim=[0,0,3600], map=[0,3600,7200]):
    //   - 1 GAME_END
    //   - 1 SLOT_UNLOCKED (only slot 2 has a positive claim offset; slots
    //     0 and 1 are claimable from t=0 per the Tier 1 + Tier 2 spec)
    //   - 2 SLOT_MAP_UNLOCKED (slot 1 at t=P, slot 2 at t=2P — both
    //     differ from their claim offset so the scheduler doesn't dedupe)
    //   - 2 VISIBILITY_PHASE_ADVANCE (k=1, k=2)
    //   - 3 NOTIFICATION (PRODUCTION_LOBBY_PRESET.notifications)
    expect(jobCount).toBe(9);

    const game = await Game.findByPk(result.gameId);
    expect(game?.status).toBe("active");
    expect(game?.slotsPerNode).toBe(3);
    expect(game?.deadWallSize).toBe(15);
    expect(game?.visibilityPhaseCount).toBe(3);
    // Production preset's challenge cooldown floor snapshots through
    // to games.challenge_cooldown_seconds (TDD §3.8).
    expect(game?.challengeCooldownSeconds).toBe(300);
  });

  it("snapshots non-default slotsPerNode and visibilityPhaseCount from the lobby onto the game", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    // 23 × 3 + 13 × 4 + 15 = 136 — only visibility phase count changes here.
    await lobbyService.updateConfig(lobbyId, hostId, {
      visibilityMode: "phase",
      visibilityPhaseCount: 2,
    });

    const result = await startFromLobby(lobbyId, hostId);
    const game = await Game.findByPk(result.gameId);

    expect(game?.slotsPerNode).toBe(3);
    expect(game?.visibilityPhaseCount).toBe(2);

    // With N = 2: one VISIBILITY_PHASE_ADVANCE, preset notifications, GAME_END.
    const jobs = await GameScheduledJob.findAll({
      where: { gameId: result.gameId },
      order: [["runAt", "ASC"]],
    });
    expect(jobs.map((j) => j.jobType)).toEqual([
      "VISIBILITY_PHASE_ADVANCE",
      ...PRODUCTION_LOBBY_PRESET.notifications.map(() => "NOTIFICATION" as const),
      "GAME_END",
    ]);
  });

  it("snapshots map_template_node_challenges into game_node_challenges per cloned game node", async () => {
    // The integration suite's globalSetup seeds the TTC 2026 challenge
    // catalog into `map_template_node_challenges`. Treat that table as
    // the source of truth at runtime so this stays green as the JSON
    // authoring file evolves.
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const result = await startFromLobby(lobbyId, hostId);

    const gameNodes = await GameNode.findAll({
      where: { gameId: result.gameId },
      attributes: ["id", "templateNodeId"],
    });
    const templateNodeIds = gameNodes.map((n) => n.templateNodeId);
    const seededBindings = await MapTemplateNodeChallenge.findAll({
      where: { mapTemplateNodeId: templateNodeIds },
    });
    expect(seededBindings.length).toBeGreaterThan(0);

    const queueRows = await GameNodeChallenge.findAll({
      include: [
        {
          model: GameNode,
          where: { gameId: result.gameId },
          attributes: ["id", "templateNodeId"],
        },
      ],
    });
    expect(queueRows).toHaveLength(seededBindings.length);

    const tripleKey = (
      templateNodeId: string,
      challengeId: string,
      sortOrder: number,
    ): string => `${templateNodeId}:${challengeId}:${sortOrder}`;
    const seededKeys = new Set(
      seededBindings.map((b) =>
        tripleKey(b.mapTemplateNodeId, b.challengeId, b.sortOrder),
      ),
    );
    for (const row of queueRows) {
      expect(
        seededKeys.has(
          tripleKey(row.gameNode!.templateNodeId, row.challengeId, row.sortOrder),
        ),
      ).toBe(true);
    }
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

    expect(notifJobs).toHaveLength(2 + PRODUCTION_LOBBY_PRESET.notifications.length);

    const gameStartJob = notifJobs.find(
      (job) => (job.payload as { template?: string }).template === "game_start",
    );
    expect(gameStartJob?.runAt.getTime()).toBe(game!.startedAt.getTime());
    expect(gameStartJob?.payload).toEqual({
      template: "game_start",
      data: null,
    });

    const hostWarningJob = notifJobs.find(
      (job) =>
        (job.payload as { template?: string; data?: { minutesLeft?: number } })
          .template === "time_warning" &&
        (job.payload as { data?: { minutesLeft?: number } }).data?.minutesLeft ===
        10,
    );
    expect(hostWarningJob?.runAt.getTime()).toBe(
      game!.startedAt.getTime() + 600 * 1000,
    );
  });

  describe("visibility mode (chunk 3)", () => {
    it("snapshots lobby.visibilityMode onto games.visibility_mode", async () => {
      const { lobbyId, hostId } = await createLobbyWithFourPlayers();
      await lobbyService.updateConfig(lobbyId, hostId, {
        visibilityMode: "slot",
      });

      const { gameId } = await startFromLobby(lobbyId, hostId);
      const game = await Game.findByPk(gameId);
      expect(game?.visibilityMode).toBe("slot");
    });

    it("seeds positions + rule flag without phase tables when mode='slot' (phase off)", async () => {
      const { lobbyId, hostId } = await createLobbyWithFourPlayers();
      await lobbyService.updateConfig(lobbyId, hostId, {
        visibilityMode: "slot",
      });

      const { gameId } = await startFromLobby(lobbyId, hostId);

      const teams = await GameTeam.findAll({ where: { gameId } });
      expect(teams).toHaveLength(4);

      // Always-needed: positions + red-fives rule flag.
      const positions = await GameTeamPosition.findAll({
        where: { gameTeamId: teams.map((t) => t.id) },
      });
      expect(positions).toHaveLength(4);
      const ruleFlags = await GameRuleFlag.findAll({ where: { gameId } });
      expect(ruleFlags).toHaveLength(1);

      // Phase tables should be empty — bootstrap was gated.
      const nodes = await GameNode.findAll({
        where: { gameId },
        attributes: ["id"],
      });
      const visibilityGroups = await GameNodeVisibilityGroup.findAll({
        where: { gameNodeId: nodes.map((n) => n.id) },
      });
      expect(visibilityGroups).toHaveLength(0);
      const homeGroups = await GameTeamHomeGroup.findAll({
        where: { gameId },
      });
      expect(homeGroups).toHaveLength(0);
      const phaseFaceUp = await GameLocationTeamVisibility.findAll({
        where: { gameTeamId: teams.map((t) => t.id) },
      });
      expect(phaseFaceUp).toHaveLength(0);
    });

    it("seeds no jobs except GAME_END when mode='none'", async () => {
      const { lobbyId, hostId } = await createLobbyWithFourPlayers();
      await lobbyService.updateConfig(lobbyId, hostId, {
        visibilityMode: "none",
      });

      const { gameId } = await startFromLobby(lobbyId, hostId);

      const jobs = await GameScheduledJob.findAll({ where: { gameId } });
      const types = jobs.map((j) => j.jobType).sort();
      expect(types).toEqual([
        ...PRODUCTION_LOBBY_PRESET.notifications.map(() => "NOTIFICATION"),
        "GAME_END",
      ].sort());
    });

    it("phase-only games keep the phase tables and skip SLOT_UNLOCKED jobs", async () => {
      const { lobbyId, hostId } = await createLobbyWithFourPlayers();
      // Configure a non-trivial slot offset *before* switching modes so
      // the transition resets it (mode lock); we still expect zero
      // SLOT_UNLOCKED jobs because the slot layer is off.
      await lobbyService.updateConfig(lobbyId, hostId, {
        visibilityMode: "phase",
      });

      const { gameId } = await startFromLobby(lobbyId, hostId);

      const groups = await GameNodeVisibilityGroup.count();
      expect(groups).toBeGreaterThan(0);

      const jobs = await GameScheduledJob.findAll({ where: { gameId } });
      const types = jobs.map((j) => j.jobType);
      expect(types).toContain("VISIBILITY_PHASE_ADVANCE");
      expect(types).not.toContain("SLOT_UNLOCKED");
    });
  });

  it("relax start distributes unassigned players across teams", async () => {
    const host = await registerUser({ username: "waterbug" });
    await setUserAdmin(host.user.id);
    const guest = await registerUser();

    const lobby = await lobbyService.createLobby(host.user.id, {});
    await lobbyService.joinLobby(lobby.id, guest.user.id);

    const result = await startFromLobby(lobby.id, host.user.id);

    const participants = await GameParticipant.findAll({
      where: { gameId: result.gameId },
      include: [{ model: GameTeam, include: [TeamDefinition] }],
    });

    expect(participants).toHaveLength(2);
    expect(new Set(participants.map((p) => p.gameTeamId)).size).toBe(2);

    const seatWinds = await Promise.all(
      participants.map((p) =>
        buildGameStateProjection(result.gameId, p.gameTeamId).then(
          (projection) => projection.seatWind,
        ),
      ),
    );
    expect(new Set(seatWinds).size).toBe(2);
  });

  it("rejects non-admin users", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers();
    const outsider = await registerUser();

    await expect(startFromLobby(lobbyId, outsider.user.id)).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});
