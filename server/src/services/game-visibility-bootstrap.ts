import type { Transaction } from "sequelize";
import {
  assignHomeGroupsToTeams,
  partitionNodesIntoGroups,
  visibleGroupIndices,
  type VisibilityGroupIndex,
} from "../game/visibility-groups.ts";
import { HttpError } from "../lib/http-error.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeVisibilityGroup } from "../models/game-node-visibility-group.ts";
import { GameRuleFlag } from "../models/game-rule-flag.ts";
import { GameTeamHomeGroup } from "../models/game-team-home-group.ts";
import { GameTeamPosition } from "../models/game-team-position.ts";
import { RED_FIVES_RULE_KEY } from "../tiles/red-five.ts";
import {
  GAME_TEAM_SLOTS,
  type GameTeamSlot,
} from "./even-team-assignment.ts";

/**
 * Bootstrap visibility state for a freshly cloned game map. Caller passes
 * `visibilityPhaseCount` (= number of visibility groups). Edge case
 * `visibilityPhaseCount === 1` is supported: every node lands in the single
 * group 0, every team's home is group 0, and phase 0 reveals everything.
 */
export async function bootstrapGameVisibility(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  startedAt: Date,
  defaultStartNodeCode: string | null,
  visibilityPhaseCount: number,
  transaction: Transaction,
): Promise<void> {
  const teamIdsInSlotOrder = GAME_TEAM_SLOTS.map((slot) => {
    const gameTeamId = gameTeamIdBySlot.get(slot);
    if (!gameTeamId) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing game team for slot ${slot}`,
      );
    }
    return gameTeamId;
  });

  const nodes = await GameNode.findAll({
    where: { gameId },
    attributes: ["id"],
    transaction,
  });
  const nodeIds = nodes.map((node) => node.id);

  const groupsByIndex = partitionNodesIntoGroups(nodeIds, visibilityPhaseCount);
  const nodeIdToGroupIndex = new Map<string, VisibilityGroupIndex>();
  for (const [groupIndex, groupNodeIds] of groupsByIndex) {
    for (const nodeId of groupNodeIds) {
      nodeIdToGroupIndex.set(nodeId, groupIndex);
    }
  }

  await GameNodeVisibilityGroup.bulkCreate(
    nodeIds.map((gameNodeId) => ({
      gameNodeId,
      groupIndex: nodeIdToGroupIndex.get(gameNodeId)!,
    })),
    { transaction },
  );

  const homeGroupByTeamId = assignHomeGroupsToTeams(
    teamIdsInSlotOrder,
    visibilityPhaseCount,
  );

  await GameTeamHomeGroup.bulkCreate(
    teamIdsInSlotOrder.map((gameTeamId) => ({
      gameId,
      gameTeamId,
      groupIndex: homeGroupByTeamId.get(gameTeamId)!,
    })),
    { transaction },
  );

  const visibilityRows: Array<{
    gameTeamId: string;
    gameNodeId: string;
    isFaceUp: boolean;
    source: "phase";
    revealedAt: Date;
  }> = [];

  for (const gameTeamId of teamIdsInSlotOrder) {
    const homeGroup = homeGroupByTeamId.get(gameTeamId)!;
    const visibleGroups = visibleGroupIndices(
      homeGroup,
      0,
      visibilityPhaseCount,
    );
    const visibleNodeIds = new Set<string>();
    for (const groupIndex of visibleGroups) {
      for (const nodeId of groupsByIndex.get(groupIndex) ?? []) {
        visibleNodeIds.add(nodeId);
      }
    }
    for (const gameNodeId of visibleNodeIds) {
      visibilityRows.push({
        gameTeamId,
        gameNodeId,
        isFaceUp: true,
        source: "phase",
        revealedAt: startedAt,
      });
    }
  }

  await GameLocationTeamVisibility.bulkCreate(visibilityRows, { transaction });

  let startGameNodeId: string | null = null;
  if (defaultStartNodeCode != null) {
    const startNode = await GameNode.findOne({
      where: { gameId, code: defaultStartNodeCode },
      attributes: ["id"],
      transaction,
    });
    if (!startNode) {
      throw new HttpError(
        500,
        "internal_error",
        `Default start station "${defaultStartNodeCode}" not found on game map`,
      );
    }
    startGameNodeId = startNode.id;
  }

  await GameTeamPosition.bulkCreate(
    teamIdsInSlotOrder.map((gameTeamId) => ({
      gameTeamId,
      currentGameNodeId: startGameNodeId,
    })),
    { transaction },
  );

  await GameRuleFlag.create(
    {
      gameId,
      ruleKey: RED_FIVES_RULE_KEY,
      enabled: true,
    },
    { transaction },
  );
}
