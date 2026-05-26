import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapGameVisibility } from "../../../src/services/game-visibility-bootstrap.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameNodeVisibilityGroup } from "../../../src/models/game-node-visibility-group.ts";
import { GameRuleFlag } from "../../../src/models/game-rule-flag.ts";
import { GameTeamHomeGroup } from "../../../src/models/game-team-home-group.ts";
import { GameTeamPosition } from "../../../src/models/game-team-position.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { RED_FIVES_RULE_KEY } from "../../../src/tiles/red-five.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { createGameShellWithMap } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("bootstrapGameVisibility", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("assigns visibility groups, home groups, start positions, and red-five rule (default 4 phases)", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await bootstrapGameVisibility(
        shell.gameId,
        shell.gameTeamIdBySlot,
        shell.startedAt,
        "bay",
        4,
        transaction,
      );

      const [
        groupCount,
        homeGroupCount,
        faceUpCount,
        positionCount,
        ruleFlag,
        bayNode,
      ] = await Promise.all([
        GameNodeVisibilityGroup.count({ transaction }),
        GameTeamHomeGroup.count({ where: { gameId: shell.gameId }, transaction }),
        GameLocationTeamVisibility.count({
          where: { isFaceUp: true },
          transaction,
        }),
        GameTeamPosition.count({
          where: { gameTeamId: [...shell.gameTeamIdBySlot.values()] },
          transaction,
        }),
        GameRuleFlag.findOne({
          where: { gameId: shell.gameId, ruleKey: RED_FIVES_RULE_KEY },
          transaction,
        }),
        GameNode.findOne({
          where: { gameId: shell.gameId, code: "bay" },
          transaction,
        }),
      ]);

      expect(groupCount).toBe(84);
      expect(homeGroupCount).toBe(4);
      expect(faceUpCount).toBe(84);
      expect(positionCount).toBe(4);

      const positions = await GameTeamPosition.findAll({
        where: { gameTeamId: [...shell.gameTeamIdBySlot.values()] },
        transaction,
      });
      expect(positions.every((p) => p.currentGameNodeId === bayNode?.id)).toBe(true);
      expect(ruleFlag?.enabled).toBe(true);
    });
  });

  it("reveals everything at phase 0 when visibilityPhaseCount = 1", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await bootstrapGameVisibility(
        shell.gameId,
        shell.gameTeamIdBySlot,
        shell.startedAt,
        null,
        1,
        transaction,
      );

      const homeGroups = await GameTeamHomeGroup.findAll({
        where: { gameId: shell.gameId },
        transaction,
      });
      expect(homeGroups).toHaveLength(4);
      expect(homeGroups.every((row) => row.groupIndex === 0)).toBe(true);

      const allGroupRows = await GameNodeVisibilityGroup.findAll({ transaction });
      expect(allGroupRows.every((row) => row.groupIndex === 0)).toBe(true);
      expect(allGroupRows).toHaveLength(84);

      const faceUpCount = await GameLocationTeamVisibility.count({
        where: { isFaceUp: true },
        transaction,
      });
      // 84 nodes × 4 teams, all revealed because every node is in the home group.
      expect(faceUpCount).toBe(84 * 4);
    });
  });

  it("partitions into 6 groups (more groups than teams) and reveals only the home group at phase 0", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await bootstrapGameVisibility(
        shell.gameId,
        shell.gameTeamIdBySlot,
        shell.startedAt,
        null,
        6,
        transaction,
      );

      const groupRows = await GameNodeVisibilityGroup.findAll({ transaction });
      expect(groupRows).toHaveLength(84);
      const sizes = new Map<number, number>();
      for (const row of groupRows) {
        sizes.set(row.groupIndex, (sizes.get(row.groupIndex) ?? 0) + 1);
      }
      // 84 / 6 = 14 evenly; every group should have exactly 14 nodes.
      expect([...sizes.values()].every((n) => n === 14)).toBe(true);
      expect(sizes.size).toBe(6);

      const homeGroups = await GameTeamHomeGroup.findAll({
        where: { gameId: shell.gameId },
        transaction,
      });
      expect(homeGroups).toHaveLength(4);
      const usedGroupIndices = new Set(homeGroups.map((r) => r.groupIndex));
      // With 4 teams and 6 groups, each home should be unique.
      expect(usedGroupIndices.size).toBe(4);

      // Phase 0 reveals only the home group per team (14 face-up rows per team).
      const faceUpPerTeam = new Map<string, number>();
      const faceUpRows = await GameLocationTeamVisibility.findAll({
        where: { isFaceUp: true },
        transaction,
      });
      for (const row of faceUpRows) {
        faceUpPerTeam.set(
          row.gameTeamId,
          (faceUpPerTeam.get(row.gameTeamId) ?? 0) + 1,
        );
      }
      expect([...faceUpPerTeam.values()].every((n) => n === 14)).toBe(true);
      expect(faceUpPerTeam.size).toBe(4);
    });
  });
});
