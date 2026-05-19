import { shuffleInPlace } from "../lib/shuffle.ts";

export const VISIBILITY_GROUP_COUNT = 4;
export const NODES_PER_VISIBILITY_GROUP = 21;
export const EXPECTED_MAP_NODE_COUNT = 84;

export type VisibilityGroupIndex = 0 | 1 | 2 | 3;

/**
 * Random partition of 84 nodes into four groups of 21.
 */
export function partitionNodesIntoGroups(
  nodeIds: string[],
): Map<VisibilityGroupIndex, string[]> {
  if (nodeIds.length !== EXPECTED_MAP_NODE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_MAP_NODE_COUNT} nodes for visibility partition, got ${nodeIds.length}`,
    );
  }

  const shuffled = [...nodeIds];
  shuffleInPlace(shuffled);

  const groups = new Map<VisibilityGroupIndex, string[]>();
  for (let g = 0; g < VISIBILITY_GROUP_COUNT; g += 1) {
    const start = g * NODES_PER_VISIBILITY_GROUP;
    groups.set(
      g as VisibilityGroupIndex,
      shuffled.slice(start, start + NODES_PER_VISIBILITY_GROUP),
    );
  }
  return groups;
}

/**
 * Assign a unique home group (0–3) to each team in slot order.
 */
export function assignHomeGroupsToTeams(
  teamIdsInSlotOrder: string[],
): Map<string, VisibilityGroupIndex> {
  if (teamIdsInSlotOrder.length !== VISIBILITY_GROUP_COUNT) {
    throw new Error(
      `Expected ${VISIBILITY_GROUP_COUNT} teams for home group assignment, got ${teamIdsInSlotOrder.length}`,
    );
  }

  const groupIndices: VisibilityGroupIndex[] = [0, 1, 2, 3];
  shuffleInPlace(groupIndices);

  const result = new Map<string, VisibilityGroupIndex>();
  for (let i = 0; i < teamIdsInSlotOrder.length; i += 1) {
    result.set(teamIdsInSlotOrder[i], groupIndices[i]);
  }
  return result;
}

/**
 * Unlock order per team: home, then clockwise through quarters.
 * Returns the first (phase + 1) group indices visible at the given phase.
 */
export function visibleGroupIndices(
  homeGroup: VisibilityGroupIndex,
  phase: number,
): VisibilityGroupIndex[] {
  const order: VisibilityGroupIndex[] = [
    homeGroup,
    ((homeGroup + 1) % 4) as VisibilityGroupIndex,
    ((homeGroup + 2) % 4) as VisibilityGroupIndex,
    ((homeGroup + 3) % 4) as VisibilityGroupIndex,
  ];
  const count = Math.min(Math.max(phase, 0) + 1, VISIBILITY_GROUP_COUNT);
  return order.slice(0, count);
}
