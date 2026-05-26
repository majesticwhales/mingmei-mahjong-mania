import { describe, expect, it, vi } from "vitest";
import * as shuffle from "../../../src/lib/shuffle.ts";
import {
  assignHomeGroupsToTeams,
  partitionNodesIntoGroups,
  visibleGroupIndices,
} from "../../../src/game/visibility-groups.ts";

function nodeIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `node-${i}`);
}

describe("partitionNodesIntoGroups", () => {
  it("rejects non-positive group counts", () => {
    expect(() => partitionNodesIntoGroups(nodeIds(4), 0)).toThrow(/groupCount/);
    expect(() => partitionNodesIntoGroups(nodeIds(4), -1)).toThrow(/groupCount/);
  });

  it("places every node in group 0 when groupCount = 1", () => {
    const ids = nodeIds(7);
    const groups = partitionNodesIntoGroups(ids, 1);

    expect(groups.size).toBe(1);
    expect(groups.get(0)).toHaveLength(7);
    expect(new Set(groups.get(0))).toEqual(new Set(ids));
  });

  it("splits 84 nodes into four groups of 21 with no duplicates (default config)", () => {
    const ids = nodeIds(84);
    const groups = partitionNodesIntoGroups(ids, 4);

    expect(groups.size).toBe(4);
    const flat: string[] = [];
    for (let g = 0; g < 4; g += 1) {
      expect(groups.get(g)).toHaveLength(21);
      flat.push(...groups.get(g)!);
    }
    expect(new Set(flat).size).toBe(84);
    expect(new Set(flat)).toEqual(new Set(ids));
  });

  it("distributes leftovers one extra to the first groups on uneven divisors", () => {
    const ids = nodeIds(10);
    const groups = partitionNodesIntoGroups(ids, 3);

    expect(groups.size).toBe(3);
    expect(groups.get(0)).toHaveLength(4);
    expect(groups.get(1)).toHaveLength(3);
    expect(groups.get(2)).toHaveLength(3);

    const flat = [
      ...(groups.get(0) ?? []),
      ...(groups.get(1) ?? []),
      ...(groups.get(2) ?? []),
    ];
    expect(new Set(flat).size).toBe(10);
    expect(new Set(flat)).toEqual(new Set(ids));
  });

  it("supports more groups than nodes (some groups empty)", () => {
    const ids = nodeIds(2);
    const groups = partitionNodesIntoGroups(ids, 5);

    expect(groups.size).toBe(5);
    const sizes = [0, 1, 2, 3, 4].map((g) => groups.get(g)?.length ?? -1);
    expect(sizes).toEqual([1, 1, 0, 0, 0]);
  });

  it("returns empty groups when nodeIds is empty", () => {
    const groups = partitionNodesIntoGroups([], 3);
    expect(groups.size).toBe(3);
    for (let g = 0; g < 3; g += 1) {
      expect(groups.get(g)).toEqual([]);
    }
  });
});

describe("assignHomeGroupsToTeams", () => {
  it("rejects non-positive group counts", () => {
    expect(() => assignHomeGroupsToTeams(["t1"], 0)).toThrow(/groupCount/);
  });

  it("assigns home group 0 to every team when groupCount = 1", () => {
    const homes = assignHomeGroupsToTeams(["t1", "t2", "t3", "t4"], 1);
    expect([...homes.values()]).toEqual([0, 0, 0, 0]);
  });

  it("assigns a unique home group index to each of four teams in default config", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});

    const teams = ["t1", "t2", "t3", "t4"];
    const homes = assignHomeGroupsToTeams(teams, 4);

    expect(homes.get("t1")).toBe(0);
    expect(homes.get("t2")).toBe(1);
    expect(homes.get("t3")).toBe(2);
    expect(homes.get("t4")).toBe(3);
    expect(new Set(homes.values())).toEqual(new Set([0, 1, 2, 3]));

    vi.restoreAllMocks();
  });

  it("leaves extra groups unused when teamCount < groupCount", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});

    const homes = assignHomeGroupsToTeams(["t1", "t2"], 6);

    expect(homes.size).toBe(2);
    expect(homes.get("t1")).toBe(0);
    expect(homes.get("t2")).toBe(1);

    vi.restoreAllMocks();
  });

  it("shares home groups evenly when teamCount > groupCount", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});

    const homes = assignHomeGroupsToTeams(
      ["t1", "t2", "t3", "t4", "t5"],
      3,
    );

    expect(homes.get("t1")).toBe(0);
    expect(homes.get("t2")).toBe(1);
    expect(homes.get("t3")).toBe(2);
    expect(homes.get("t4")).toBe(0);
    expect(homes.get("t5")).toBe(1);

    vi.restoreAllMocks();
  });
});

describe("visibleGroupIndices", () => {
  it("rejects non-positive group counts", () => {
    expect(() => visibleGroupIndices(0, 0, 0)).toThrow(/groupCount/);
  });

  it("returns [0] for every phase when groupCount = 1", () => {
    expect(visibleGroupIndices(0, 0, 1)).toEqual([0]);
    expect(visibleGroupIndices(0, 1, 1)).toEqual([0]);
    expect(visibleGroupIndices(0, 99, 1)).toEqual([0]);
  });

  it("unlocks home group only at phase 0", () => {
    expect(visibleGroupIndices(2, 0, 4)).toEqual([2]);
  });

  it("adds groups clockwise through the final phase (default config)", () => {
    expect(visibleGroupIndices(2, 1, 4)).toEqual([2, 3]);
    expect(visibleGroupIndices(2, 2, 4)).toEqual([2, 3, 0]);
    expect(visibleGroupIndices(2, 3, 4)).toEqual([2, 3, 0, 1]);
  });

  it("wraps home group forward (default config)", () => {
    expect(visibleGroupIndices(3, 1, 4)).toEqual([3, 0]);
  });

  it("walks N groups for arbitrary N", () => {
    expect(visibleGroupIndices(4, 2, 6)).toEqual([4, 5, 0]);
    expect(visibleGroupIndices(4, 5, 6)).toEqual([4, 5, 0, 1, 2, 3]);
  });

  it("caps phase at the final group", () => {
    expect(visibleGroupIndices(0, 100, 3)).toEqual([0, 1, 2]);
  });

  it("treats negative phase as phase 0", () => {
    expect(visibleGroupIndices(1, -5, 4)).toEqual([1]);
  });
});
