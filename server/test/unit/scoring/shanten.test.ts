import { describe, expect, it } from "vitest";

import {
  computeShanten,
  computeShantenChiitoitsu,
  computeShantenKokushi,
  computeShantenStandard,
} from "../../../src/scoring/shanten.ts";
import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  tileIndex,
} from "../../../src/scoring/tile-counts.ts";
import type { Suit } from "../../../src/scoring/types.ts";

type CountEntry = readonly [Suit, number, number];

function makeCounts(...entries: readonly CountEntry[]): TileCounts {
  const counts = new Uint8Array(TILE_COUNTS_LENGTH);
  for (const [suit, rank, n] of entries) {
    counts[tileIndex(suit, rank)] = n;
  }
  return counts;
}

describe("computeShanten — winning hands", () => {
  it("returns -1 for a complete standard winning hand (14 tiles)", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["pin", 4, 1],
      ["pin", 5, 1],
      ["pin", 6, 1],
      ["sou", 7, 1],
      ["sou", 8, 1],
      ["sou", 9, 1],
      ["wind", 1, 3],
      ["dragon", 1, 2],
    );
    expect(computeShanten(counts)).toBe(-1);
  });

  it("returns -1 for a complete seven-pairs winning hand", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
      ["dragon", 3, 2],
    );
    expect(computeShanten(counts)).toBe(-1);
  });

  it("returns -1 for a complete thirteen-orphans winning hand", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 9, 1],
      ["pin", 1, 1],
      ["pin", 9, 1],
      ["sou", 1, 1],
      ["sou", 9, 1],
      ["wind", 1, 2],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["wind", 4, 1],
      ["dragon", 1, 1],
      ["dragon", 2, 1],
      ["dragon", 3, 1],
    );
    expect(computeShanten(counts)).toBe(-1);
  });
});

describe("computeShanten — tenpai shapes", () => {
  it("ryanmen tenpai: 23p waits on 1p/4p", () => {
    // 23p + 234m + 567m + 234s + dd-pair = 2+3+3+3+2 = 13 tiles
    const counts = makeCounts(
      ["pin", 2, 1],
      ["pin", 3, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["dragon", 1, 2],
    );
    expect(computeShanten(counts)).toBe(0);
  });

  it("kanchan tenpai: 13p waits on 2p only", () => {
    // 13p (gap) + 234m + 567m + 234s + dd-pair = 2+3+3+3+2 = 13
    const counts = makeCounts(
      ["pin", 1, 1],
      ["pin", 3, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["dragon", 1, 2],
    );
    expect(computeShanten(counts)).toBe(0);
  });

  it("penchan tenpai: 12p waits on 3p only", () => {
    const counts = makeCounts(
      ["pin", 1, 1],
      ["pin", 2, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["dragon", 1, 2],
    );
    expect(computeShanten(counts)).toBe(0);
  });

  it("shanpon tenpai: two pairs waiting on either as the triplet", () => {
    // 11m + 22p + 234m + 567m + 234s = 2+2+3+3+3 = 13
    const counts = makeCounts(
      ["man", 1, 2],
      ["pin", 2, 2],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
    );
    expect(computeShanten(counts)).toBe(0);
  });

  it("tanki tenpai: 4 complete sets + 1 lone tile waits to pair it up", () => {
    // 123m 456m 789m 123p + 1d (lone)
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["man", 8, 1],
      ["man", 9, 1],
      ["pin", 1, 1],
      ["pin", 2, 1],
      ["pin", 3, 1],
      ["dragon", 1, 1],
    );
    expect(computeShanten(counts)).toBe(0);
  });

  it("seven-pairs tenpai: 6 pairs + 1 single", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
      ["dragon", 3, 1],
    );
    expect(computeShantenChiitoitsu(counts)).toBe(0);
    expect(computeShanten(counts)).toBe(0);
  });

  it("thirteen-orphans 13-way wait: all 13 orphans, no double", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 9, 1],
      ["pin", 1, 1],
      ["pin", 9, 1],
      ["sou", 1, 1],
      ["sou", 9, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["wind", 4, 1],
      ["dragon", 1, 1],
      ["dragon", 2, 1],
      ["dragon", 3, 1],
    );
    expect(computeShantenKokushi(counts)).toBe(0);
    expect(computeShanten(counts)).toBe(0);
  });

  it("thirteen-orphans single-wait tenpai: 12 distinct orphans + 1 doubled (13 tiles, missing dragon-3)", () => {
    const counts = makeCounts(
      ["man", 1, 2], // the doubled orphan
      ["man", 9, 1],
      ["pin", 1, 1],
      ["pin", 9, 1],
      ["sou", 1, 1],
      ["sou", 9, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["wind", 4, 1],
      ["dragon", 1, 1],
      ["dragon", 2, 1],
      // dragon-3 missing — that's the single wait
    );
    expect(computeShantenKokushi(counts)).toBe(0);
    expect(computeShanten(counts)).toBe(0);
  });
});

describe("computeShanten — iishanten", () => {
  it("iishanten: 3 sets + 1 partial + lone tile (no pair yet)", () => {
    // 23p + 234m + 567m + 234s + 1d (single, not pair) = 2+3+3+3+1 = 12 tiles? need 13.
    // Try: 23p + 234m + 567m + 234s + 1d + 2d = 2+3+3+3+1+1 = 13
    // M = 3 (three runs), P = 1 (proto-run 23p), hasPair = 0, plus 2 lone honour tiles.
    // Shanten = 8 - 6 - 1 - 0 = 1. ✓
    const counts = makeCounts(
      ["pin", 2, 1],
      ["pin", 3, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["dragon", 1, 1],
      ["dragon", 2, 1],
    );
    expect(computeShanten(counts)).toBe(1);
  });

  it("iishanten: 2 sets + 2 partials + pair", () => {
    // 234m + 234p + 23s + 56s + 11d = 3+3+2+2+2 = 12 → need 13. Add one more single:
    // 234m + 234p + 23s + 56s + 11d + 1w = 13
    const counts = makeCounts(
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["pin", 2, 1],
      ["pin", 3, 1],
      ["pin", 4, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 5, 1],
      ["sou", 6, 1],
      ["dragon", 1, 2],
      ["wind", 1, 1],
    );
    expect(computeShanten(counts)).toBe(1);
  });

  it("seven-pairs iishanten: 5 pairs + 3 singles", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["dragon", 3, 1],
    );
    expect(computeShantenChiitoitsu(counts)).toBe(1);
  });

  it("kokushi iishanten: 12 distinct orphans + 1 non-orphan single = 13 tiles, no double", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 9, 1],
      ["pin", 1, 1],
      ["pin", 9, 1],
      ["sou", 1, 1],
      ["sou", 9, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["wind", 4, 1],
      ["dragon", 1, 1],
      ["dragon", 2, 1],
      ["man", 5, 1], // non-orphan filler
    );
    // distinctOrphans = 12, hasOrphanPair = 0 → kokushi shanten = 13 - 12 - 0 = 1
    expect(computeShantenKokushi(counts)).toBe(1);
  });
});

describe("computeShanten — chiitoitsu distance ladder", () => {
  it("chiitoitsu shanten = 2 for 4 pairs + 5 singles", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 1],
      ["sou", 1, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["dragon", 3, 1],
    );
    expect(computeShantenChiitoitsu(counts)).toBe(2);
  });

  it("chiitoitsu shanten = 6 for an all-distinct 13-tile hand (no pairs)", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["pin", 4, 1],
      ["pin", 5, 1],
      ["pin", 6, 1],
      ["sou", 7, 1],
      ["sou", 8, 1],
      ["sou", 9, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["dragon", 1, 1],
    );
    expect(computeShantenChiitoitsu(counts)).toBe(6);
  });
});

describe("computeShanten — worst-case bounds", () => {
  it("scattered 13-tile hand with no useful structure has shanten >= 4", () => {
    // 1m 4m 7m + 2p 5p 8p + 3s 6s 9s + east south west north (winds) = 12 tiles, +1 dragon
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 4, 1],
      ["man", 7, 1],
      ["pin", 2, 1],
      ["pin", 5, 1],
      ["pin", 8, 1],
      ["sou", 3, 1],
      ["sou", 6, 1],
      ["sou", 9, 1],
      ["wind", 1, 1],
      ["wind", 2, 1],
      ["wind", 3, 1],
      ["wind", 4, 1],
    );
    const sh = computeShanten(counts);
    expect(sh).toBeGreaterThanOrEqual(4);
  });
});

describe("computeShanten — input validation", () => {
  it("throws for hands with fewer than 13 tiles", () => {
    const counts = makeCounts(["man", 1, 4], ["man", 2, 4]);
    expect(() => computeShanten(counts)).toThrow(/13- or 14-tile/);
  });

  it("throws for hands with more than 14 tiles", () => {
    const counts = makeCounts(
      ["man", 1, 4],
      ["man", 2, 4],
      ["man", 3, 4],
      ["man", 4, 4],
    );
    expect(() => computeShanten(counts)).toThrow(/13- or 14-tile/);
  });
});

describe("computeShantenStandard — direct invocation", () => {
  it("agrees with the global minimum on a clearly-standard tenpai", () => {
    const counts = makeCounts(
      ["pin", 2, 1],
      ["pin", 3, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["man", 7, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["dragon", 1, 2],
    );
    expect(computeShantenStandard(counts)).toBe(0);
  });
});
