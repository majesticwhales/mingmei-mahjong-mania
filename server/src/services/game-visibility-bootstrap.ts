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

function teamIdsBySlotOrder(
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
): string[] {
  return GAME_TEAM_SLOTS.map((slot) => {
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
}

/**
 * Always-needed game-start setup, independent of the phase-reveal layer:
 *
 *  - `game_team_positions`: one row per team with `current_game_node_id =
 *    NULL` (teams are not checked in until they issue `CHECK_IN`).
 *    CHECK_IN / CHECK_OUT handlers throw a 500 if this row is missing,
 *    so it must seed regardless of `visibility_mode`.
 *  - `game_rule_flags` red-fives row: scoring catalog flag consumed by
 *    `analyzeHand`; not phase-related.
 *
 * Split out from `bootstrapGameVisibility` so games with phase off
 * (mode `none` or `slot`) can still run this minimum setup without
 * also seeding the phase-only `game_node_visibility_groups` /
 * `game_team_home_groups` / `game_location_team_visibility` tables.
 */
export async function bootstrapGameTeamPositionsAndRules(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  transaction: Transaction,
): Promise<void> {
  const teamIdsInSlotOrder = teamIdsBySlotOrder(gameTeamIdBySlot);

  await GameTeamPosition.bulkCreate(
    teamIdsInSlotOrder.map((gameTeamId) => ({
      gameTeamId,
      currentGameNodeId: null,
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

/**
 * Phase-only setup: partitions nodes into `visibilityPhaseCount` groups,
 * picks a home group per team, and seeds the phase-0 face-up
 * `game_location_team_visibility` rows. Skipped entirely when the
 * lobby's `visibilityMode` excludes the phase layer; in that case the
 * projection treats every node as face-up via the mode branch in
 * `game-state.ts`.
 *
 * Edge case `visibilityPhaseCount === 1` is supported: every node lands
 * in the single group 0, every team's home is group 0, and phase 0
 * reveals everything (same row count as a phase-off game, but the
 * tables are populated so engine code that joins on them keeps working).
 */
export interface BootstrapGameVisibilityGroupsOptions {
  /**
   * When `slotsPerNode === visibilityPhaseCount`, visibility phases reveal
   * one tile slot per phase on the map rather than station groups. Every
   * node stays in group 0 and every team gets home group 0 so all
   * stations remain face-up while `games.visibility_phase` drives the
   * slot index exposed in the projection.
   */
  slotsPerNode?: number;
}

export async function bootstrapGameVisibilityGroups(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  startedAt: Date,
  visibilityPhaseCount: number,
  transaction: Transaction,
  options: BootstrapGameVisibilityGroupsOptions = {},
): Promise<void> {
  const teamIdsInSlotOrder = teamIdsBySlotOrder(gameTeamIdBySlot);

  const nodes = await GameNode.findAll({
    where: { gameId },
    attributes: ["id"],
    transaction,
  });
  const nodeIds = nodes.map((node) => node.id);

  const slotPhaseMode =
    options.slotsPerNode != null &&
    options.slotsPerNode > 1 &&
    visibilityPhaseCount === options.slotsPerNode;

  const groupsByIndex = slotPhaseMode
    ? new Map<VisibilityGroupIndex, string[]>([[0, nodeIds]])
    : partitionNodesIntoGroups(nodeIds, visibilityPhaseCount);
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

  const homeGroupByTeamId = slotPhaseMode
    ? new Map(teamIdsInSlotOrder.map((gameTeamId) => [gameTeamId, 0]))
    : assignHomeGroupsToTeams(teamIdsInSlotOrder, visibilityPhaseCount);

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
}

/**
 * Combined bootstrap for `visibility_mode = "both" | "phase"` games.
 * Wraps `bootstrapGameVisibilityGroups` + `bootstrapGameTeamPositionsAndRules`
 * so the historical call-site signature still works.
 */
export async function bootstrapGameVisibility(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  startedAt: Date,
  defaultStartNodeCode: string | null,
  visibilityPhaseCount: number,
  transaction: Transaction,
): Promise<void> {
  await bootstrapGameVisibilityGroups(
    gameId,
    gameTeamIdBySlot,
    startedAt,
    visibilityPhaseCount,
    transaction,
  );
  await bootstrapGameTeamPositionsAndRules(
    gameId,
    gameTeamIdBySlot,
    transaction,
  );
}
