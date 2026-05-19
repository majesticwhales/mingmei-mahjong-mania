import { describe, expect, it, vi } from "vitest";
import * as shuffle from "../../../src/lib/shuffle.ts";
import {
  assignHomeGroupsToTeams,
  EXPECTED_MAP_NODE_COUNT,
  partitionNodesIntoGroups,
  visibleGroupIndices,
} from "../../../src/game/visibility-groups.ts";

function nodeIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `node-${i}`);
}

describe("partitionNodesIntoGroups", () => {
  it("rejects wrong node count", () => {
    expect(() => partitionNodesIntoGroups(nodeIds(83))).toThrow(/84/);
  });

  it("splits 84 nodes into four groups of 21 with no duplicates", () => {
    const ids = nodeIds(EXPECTED_MAP_NODE_COUNT);
    const groups = partitionNodesIntoGroups(ids);

    expect(groups.size).toBe(4);
    const flat: string[] = [];
    for (let g = 0; g < 4; g += 1) {
      expect(groups.get(g as 0 | 1 | 2 | 3)).toHaveLength(21);
      flat.push(...groups.get(g as 0 | 1 | 2 | 3)!);
    }
    expect(new Set(flat).size).toBe(EXPECTED_MAP_NODE_COUNT);
    expect(new Set(flat)).toEqual(new Set(ids));
  });
});

describe("assignHomeGroupsToTeams", () => {
  it("requires exactly four teams", () => {
    expect(() => assignHomeGroupsToTeams(["t1", "t2", "t3"])).toThrow(/4 teams/);
  });

  it("assigns a unique home group index to each team", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});

    const teams = ["t1", "t2", "t3", "t4"];
    const homes = assignHomeGroupsToTeams(teams);

    expect(homes.get("t1")).toBe(0);
    expect(homes.get("t2")).toBe(1);
    expect(homes.get("t3")).toBe(2);
    expect(homes.get("t4")).toBe(3);
    expect(new Set(homes.values())).toEqual(new Set([0, 1, 2, 3]));

    vi.restoreAllMocks();
  });
});

describe("visibleGroupIndices", () => {
  it("unlocks home quarter only at phase 0", () => {
    expect(visibleGroupIndices(2, 0)).toEqual([2]);
  });

  it("adds quarters clockwise through phase 3", () => {
    expect(visibleGroupIndices(2, 1)).toEqual([2, 3]);
    expect(visibleGroupIndices(2, 2)).toEqual([2, 3, 0]);
    expect(visibleGroupIndices(2, 3)).toEqual([2, 3, 0, 1]);
  });

  it("wraps home group 3 forward", () => {
    expect(visibleGroupIndices(3, 1)).toEqual([3, 0]);
  });
});
