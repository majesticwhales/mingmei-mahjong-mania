import { describe, expect, it } from "vitest";

import { decomposeChiitoitsu } from "../../../src/scoring/decomposers/chiitoitsu.ts";
import { decomposeKokushi } from "../../../src/scoring/decomposers/kokushi.ts";
import { decomposeStandardHand } from "../../../src/scoring/decomposers/standard.ts";
import {
  countsToTiles,
  type TileCounts,
  TILE_COUNTS_LENGTH,
  tileIndex,
  tilesToCounts,
} from "../../../src/scoring/tile-counts.ts";
import type {
  Run,
  StandardDecomposition,
  Suit,
  Tile,
  Triplet,
} from "../../../src/scoring/types.ts";

type CountEntry = readonly [Suit, number, number];

function makeCounts(...entries: readonly CountEntry[]): TileCounts {
  const counts = new Uint8Array(TILE_COUNTS_LENGTH);
  for (const [suit, rank, n] of entries) {
    counts[tileIndex(suit, rank)] = n;
  }
  return counts;
}

function makeTiles(...entries: readonly CountEntry[]): Tile[] {
  const tiles: Tile[] = [];
  for (const [suit, rank, n] of entries) {
    for (let copy = 0; copy < n; copy++) {
      tiles.push({ suit, rank, copyIndex: copy });
    }
  }
  return tiles;
}

function summariseStandard(dec: StandardDecomposition): string {
  const meldKey = (m: Run | Triplet) =>
    `${m.kind === "run" ? "R" : "T"}-${m.suit}-${m.rank}`;
  const melds = dec.melds.map(meldKey).sort().join(",");
  return `${melds}|P-${dec.pair.suit}-${dec.pair.rank}`;
}

describe("tile-counts conversions", () => {
  it("round-trips a 14-tile man hand via tilesToCounts → countsToTiles", () => {
    const tiles = makeTiles(
      ["man", 1, 3],
      ["man", 2, 3],
      ["man", 3, 3],
      ["man", 4, 3],
      ["man", 5, 2],
    );
    const counts = tilesToCounts(tiles);
    expect(counts[tileIndex("man", 1)]).toBe(3);
    expect(counts[tileIndex("man", 5)]).toBe(2);
    expect(counts[tileIndex("pin", 1)]).toBe(0);

    const roundTrip = tilesToCounts(countsToTiles(counts));
    expect(Array.from(roundTrip)).toEqual(Array.from(counts));
  });

  it("handles honour tiles correctly", () => {
    const counts = tilesToCounts(
      makeTiles(["wind", 1, 4], ["dragon", 3, 2]),
    );
    expect(counts[tileIndex("wind", 1)]).toBe(4);
    expect(counts[tileIndex("dragon", 3)]).toBe(2);
    expect(counts[tileIndex("dragon", 1)]).toBe(0);
  });

  it("throws on unrecognised suits", () => {
    expect(() =>
      tilesToCounts([{ suit: "flower", rank: 1, copyIndex: 0 }]),
    ).toThrow(/Unrecognised suit/);
  });

  it("throws on out-of-range ranks via tileIndex", () => {
    expect(() => tileIndex("man", 10)).toThrow(/Invalid rank/);
    expect(() => tileIndex("dragon", 4)).toThrow(/Invalid rank/);
    expect(() => tileIndex("wind", 0)).toThrow(/Invalid rank/);
  });
});

describe("decomposeStandardHand", () => {
  it("identifies all decompositions for the ambiguous 11122233344455m hand", () => {
    const counts = makeCounts(
      ["man", 1, 3],
      ["man", 2, 3],
      ["man", 3, 3],
      ["man", 4, 3],
      ["man", 5, 2],
    );
    const results = decomposeStandardHand(counts);
    expect(results).toHaveLength(4);

    const summaries = new Set(results.map(summariseStandard));
    expect(summaries).toEqual(
      new Set([
        // pair at man-5: four triplets
        "T-man-1,T-man-2,T-man-3,T-man-4|P-man-5",
        // pair at man-5: triplet 1 + three identical runs starting at 2
        "R-man-2,R-man-2,R-man-2,T-man-1|P-man-5",
        // pair at man-5: three identical runs starting at 1 + triplet 4
        "R-man-1,R-man-1,R-man-1,T-man-4|P-man-5",
        // pair at man-2: triplet 1 + run 2-3-4 + two run 3-4-5
        "R-man-2,R-man-3,R-man-3,T-man-1|P-man-2",
      ]),
    );
  });

  it("decomposes an all-runs hand (All-Sequences shape)", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 2, 1],
      ["man", 3, 1],
      ["man", 4, 1],
      ["man", 5, 1],
      ["man", 6, 1],
      ["pin", 7, 1],
      ["pin", 8, 1],
      ["pin", 9, 1],
      ["sou", 2, 1],
      ["sou", 3, 1],
      ["sou", 4, 1],
      ["sou", 5, 2],
    );
    const results = decomposeStandardHand(counts);
    expect(results).toHaveLength(1);
    const dec = results[0];
    expect(dec.form).toBe("standard");
    expect(dec.melds.every((m) => m.kind === "run")).toBe(true);
    expect(dec.pair).toEqual({ kind: "pair", suit: "sou", rank: 5 });
  });

  it("decomposes an all-triplet hand", () => {
    const counts = makeCounts(
      ["man", 1, 3],
      ["man", 2, 3],
      ["pin", 3, 3],
      ["pin", 4, 3],
      ["sou", 5, 2],
    );
    const results = decomposeStandardHand(counts);
    expect(results).toHaveLength(1);
    expect(results[0].melds.every((m) => m.kind === "triplet")).toBe(true);
    expect(results[0].pair).toEqual({ kind: "pair", suit: "sou", rank: 5 });
  });

  it("decomposes a hand with honour triplet + dragon pair", () => {
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
    const results = decomposeStandardHand(counts);
    expect(results).toHaveLength(1);
    const dec = results[0];
    expect(dec.melds).toHaveLength(4);
    expect(dec.melds.filter((m) => m.kind === "run")).toHaveLength(3);
    const triplet = dec.melds.find((m) => m.kind === "triplet");
    expect(triplet).toEqual({ kind: "triplet", suit: "wind", rank: 1 });
    expect(dec.pair).toEqual({ kind: "pair", suit: "dragon", rank: 1 });
  });

  it("decomposes an all-honour hand", () => {
    const counts = makeCounts(
      ["wind", 1, 3],
      ["wind", 2, 3],
      ["wind", 3, 3],
      ["wind", 4, 3],
      ["dragon", 1, 2],
    );
    const results = decomposeStandardHand(counts);
    expect(results).toHaveLength(1);
    const dec = results[0];
    expect(dec.melds.every((m) => m.kind === "triplet" && m.suit === "wind")).toBe(
      true,
    );
    expect(dec.pair).toEqual({ kind: "pair", suit: "dragon", rank: 1 });
  });

  it("returns [] for a 14-tile arrangement that isn't a standard winning shape", () => {
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
      ["dragon", 2, 1],
      ["dragon", 3, 1],
    );
    expect(decomposeStandardHand(counts)).toEqual([]);
  });

  it("returns [] for non-14-tile inputs", () => {
    const thirteenTiles = makeCounts(["man", 1, 4], ["pin", 1, 4], ["sou", 1, 4], [
      "wind",
      1,
      1,
    ]);
    expect(decomposeStandardHand(thirteenTiles)).toEqual([]);

    const fifteenTiles = makeCounts(
      ["man", 1, 3],
      ["man", 2, 3],
      ["man", 3, 3],
      ["man", 4, 3],
      ["man", 5, 3],
    );
    expect(decomposeStandardHand(fifteenTiles)).toEqual([]);
  });

  it("does not mutate the input counts", () => {
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
    const snapshot = Array.from(counts);
    decomposeStandardHand(counts);
    expect(Array.from(counts)).toEqual(snapshot);
  });
});

describe("decomposeChiitoitsu", () => {
  it("accepts a valid seven-pairs hand", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
      ["dragon", 3, 2],
    );
    const results = decomposeChiitoitsu(counts);
    expect(results).toHaveLength(1);
    const pairs = results[0].pairs;
    expect(pairs).toHaveLength(7);
    expect(pairs[0]).toEqual({ kind: "pair", suit: "man", rank: 1 });
    expect(pairs[pairs.length - 1]).toEqual({
      kind: "pair",
      suit: "dragon",
      rank: 3,
    });
  });

  it("rejects 6 pairs + 1 quad (4-of-a-kind is not two pairs)", () => {
    const counts = makeCounts(
      ["man", 1, 4],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
    );
    expect(decomposeChiitoitsu(counts)).toEqual([]);
  });

  it("rejects a hand containing a triplet", () => {
    const counts = makeCounts(
      ["man", 1, 3],
      ["man", 2, 1],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
    );
    expect(decomposeChiitoitsu(counts)).toEqual([]);
  });

  it("rejects 12-tile input", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
    );
    expect(decomposeChiitoitsu(counts)).toEqual([]);
  });
});

describe("decomposeKokushi", () => {
  it("accepts the canonical kokushi hand with East wind doubled", () => {
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
    const results = decomposeKokushi(counts);
    expect(results).toHaveLength(1);
    expect(results[0].pair).toEqual({ kind: "pair", suit: "wind", rank: 1 });
  });

  it("rejects a hand missing an orphan (man-9)", () => {
    const counts = makeCounts(
      ["man", 1, 2],
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
    expect(decomposeKokushi(counts)).toEqual([]);
  });

  it("rejects a hand containing a non-orphan tile", () => {
    const counts = makeCounts(
      ["man", 1, 1],
      ["man", 5, 1],
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
    expect(decomposeKokushi(counts)).toEqual([]);
  });

  it("rejects 13 distinct orphans with no pair (only 13 tiles)", () => {
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
    expect(decomposeKokushi(counts)).toEqual([]);
  });

  it("rejects 14 orphans with two doubled (only 12 distinct orphans)", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["pin", 1, 2],
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
    expect(decomposeKokushi(counts)).toEqual([]);
  });
});
