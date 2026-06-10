import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as lobbyService from "../../../src/services/lobby-service.ts";
import * as notificationService from "../../../src/services/lobby-notification-service.ts";
import { startFromLobby } from "../../../src/services/game-start-service.ts";
import { Challenge } from "../../../src/models/challenge.ts";
import { ChallengeDeck } from "../../../src/models/challenge-deck.ts";
import { ChallengeType } from "../../../src/models/challenge-type.ts";
import { Game } from "../../../src/models/game.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameNodeChallenge } from "../../../src/models/game-node-challenge.ts";
import { GameNodeVisibilityGroup } from "../../../src/models/game-node-visibility-group.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameRuleFlag } from "../../../src/models/game-rule-flag.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { GameTeam } from "../../../src/models/game-team.ts";
import { GameTeamHomeGroup } from "../../../src/models/game-team-home-group.ts";
import { GameTeamPosition } from "../../../src/models/game-team-position.ts";
import { GameTile } from "../../../src/models/game-tile.ts";
import { Lobby } from "../../../src/models/lobby.ts";
import { MapTemplateNode } from "../../../src/models/map-template-node.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { registerUser, setUserAdmin } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

const START_TEST_DECK_CODE = "start-test-deck";
const START_TEST_CARD_CODE = "start-test-card";

async function clearStartTestCatalog(): Promise<void> {
  const stale = await Challenge.findAll({ where: { code: START_TEST_CARD_CODE } });
  if (stale.length > 0) {
    await MapTemplateNodeChallenge.destroy({
      where: { challengeId: stale.map((c) => c.id) },
    });
  }
  await ChallengeDeck.destroy({ where: { code: START_TEST_DECK_CODE } });
}

describe("startFromLobby", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearStartTestCatalog();
  });

  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearStartTestCatalog();
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

  it("snapshots map_template_node_challenges into game_node_challenges per cloned game node", async () => {
    const type = await ChallengeType.findOne();
    if (!type) throw new Error("expected at least one seeded challenge_type");
    const deck = await ChallengeDeck.create({
      code: START_TEST_DECK_CODE,
      name: "Start test deck",
      isActive: true,
      sortOrder: 0,
    });
    const card = await Challenge.create({
      challengeDeckId: deck.id,
      challengeTypeId: type.id,
      code: START_TEST_CARD_CODE,
      title: "Start test card",
      description: null,
      flavorText: "flavour",
      parameters: {},
      sortOrder: 0,
      isActive: true,
    });

    // Attach to exactly two template nodes so we can assert per-node fidelity
    // without depending on the full seeded template size.
    const templateNodes = await MapTemplateNode.findAll({
      attributes: ["id"],
      order: [["code", "ASC"]],
      limit: 2,
    });
    expect(templateNodes).toHaveLength(2);
    await MapTemplateNodeChallenge.bulkCreate(
      templateNodes.map((node) => ({
        mapTemplateNodeId: node.id,
        challengeId: card.id,
        sortOrder: 0,
      })),
    );

    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const result = await startFromLobby(lobbyId, hostId);

    const queueRows = await GameNodeChallenge.findAll({
      include: [
        {
          model: GameNode,
          where: { gameId: result.gameId },
          attributes: ["id", "templateNodeId"],
        },
      ],
    });
    expect(queueRows).toHaveLength(2);
    const templateIds = new Set(templateNodes.map((n) => n.id));
    for (const row of queueRows) {
      expect(row.challengeId).toBe(card.id);
      expect(row.sortOrder).toBe(0);
      expect(templateIds.has(row.gameNode!.templateNodeId)).toBe(true);
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
      expect(types).toEqual(["GAME_END"]);
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

  it("rejects non-admin users", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers();
    const outsider = await registerUser();

    await expect(startFromLobby(lobbyId, outsider.user.id)).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });
});
