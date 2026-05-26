import { shuffleInPlace } from "../lib/shuffle.ts";

/**
 * Index of a visibility group, in `[0, groupCount)`. Open-ended so callers can
 * use any group count; bounds enforcement is the caller's responsibility.
 */
export type VisibilityGroupIndex = number;

function assertPositive(groupCount: number, label: string): void {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new Error(`${label} must be a positive integer, got ${groupCount}`);
  }
}

/**
 * Partition `nodeIds` into `groupCount` visibility groups of roughly equal size.
 *
 * - Order is randomized via `shuffleInPlace` before partitioning.
 * - Sizes differ by at most 1 when `nodeIds.length` doesn't divide evenly:
 *   the first `nodeIds.length % groupCount` groups receive one extra node.
 * - `groupCount = 1` returns a single group containing every node.
 * - `nodeIds.length = 0` returns `groupCount` empty groups.
 */
export function partitionNodesIntoGroups(
  nodeIds: string[],
  groupCount: number,
): Map<VisibilityGroupIndex, string[]> {
  assertPositive(groupCount, "groupCount");

  const shuffled = [...nodeIds];
  shuffleInPlace(shuffled);

  const base = Math.floor(shuffled.length / groupCount);
  const remainder = shuffled.length % groupCount;

  const groups = new Map<VisibilityGroupIndex, string[]>();
  let offset = 0;
  for (let g = 0; g < groupCount; g += 1) {
    const size = g < remainder ? base + 1 : base;
    groups.set(g, shuffled.slice(offset, offset + size));
    offset += size;
  }
  return groups;
}

/**
 * Assign a home group (`0..groupCount-1`) to each team.
 *
 * Strategy: shuffle the group indices once, then assign team `i` to
 * `shuffled[i % groupCount]`. This means:
 * - When `teamIds.length === groupCount`, every team gets a unique home group.
 * - When `teamIds.length < groupCount`, some groups have no home team.
 * - When `teamIds.length > groupCount`, multiple teams share home groups, but
 *   the sharing is spread evenly (every group used at least once before any
 *   is doubled up).
 */
export function assignHomeGroupsToTeams(
  teamIdsInSlotOrder: string[],
  groupCount: number,
): Map<string, VisibilityGroupIndex> {
  assertPositive(groupCount, "groupCount");

  const groupIndices: VisibilityGroupIndex[] = Array.from(
    { length: groupCount },
    (_, i) => i,
  );
  shuffleInPlace(groupIndices);

  const result = new Map<string, VisibilityGroupIndex>();
  for (let i = 0; i < teamIdsInSlotOrder.length; i += 1) {
    result.set(teamIdsInSlotOrder[i]!, groupIndices[i % groupCount]!);
  }
  return result;
}

/**
 * Unlock order per team starting from `homeGroup` and walking forward
 * `(home + k) % groupCount` for `k = 0..groupCount-1`. Returns the first
 * `phase + 1` indices, capped at `groupCount` (i.e. the final phase reveals
 * every group).
 *
 * Edge cases:
 * - `phase < 0` is treated as phase 0 (home only).
 * - `phase >= groupCount` is treated as the final phase (all groups).
 */
export function visibleGroupIndices(
  homeGroup: VisibilityGroupIndex,
  phase: number,
  groupCount: number,
): VisibilityGroupIndex[] {
  assertPositive(groupCount, "groupCount");

  const order: VisibilityGroupIndex[] = [];
  for (let k = 0; k < groupCount; k += 1) {
    order.push((homeGroup + k) % groupCount);
  }
  const count = Math.min(Math.max(phase, 0) + 1, groupCount);
  return order.slice(0, count);
}
