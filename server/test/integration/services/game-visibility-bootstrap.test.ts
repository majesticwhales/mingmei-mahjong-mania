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

  it("assigns visibility groups, home quarters, start positions, and red-five rule", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (transaction) => {
      const shell = await createGameShellWithMap(lobbyId, transaction);
      await bootstrapGameVisibility(
        shell.gameId,
        shell.gameTeamIdBySlot,
        shell.startedAt,
        "bay",
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
});
