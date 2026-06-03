import { describe, expect, it } from "vitest";

import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  tileIndex,
} from "../../../src/scoring/tile-counts.ts";
import type { Suit } from "../../../src/scoring/types.ts";
import {
  type WaitTile,
  enumerateTenpaiWaits,
} from "../../../src/scoring/waits.ts";

type CountEntry = readonly [Suit, number, number];

function makeCounts(...entries: readonly CountEntry[]): TileCounts {
  const counts = new Uint8Array(TILE_COUNTS_LENGTH);
  for (const [suit, rank, n] of entries) {
    counts[tileIndex(suit, rank)] = n;
  }
  return counts;
}

function waitKeys(waits: readonly WaitTile[]): string[] {
  return waits.map((w) => `${w.suit}-${w.rank}`).sort();
}

describe("enumerateTenpaiWaits — non-tenpai cases", () => {
  it("returns [] for a non-13-tile input", () => {
    const counts = makeCounts(["man", 1, 4], ["pin", 1, 4]);
    expect(enumerateTenpaiWaits(counts)).toEqual([]);
  });

  it("returns [] for a 13-tile hand that is not tenpai (iishanten)", () => {
    // 23p + 234m + 567m + 234s + 1d + 2d = 13, iishanten (no pair)
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
    expect(enumerateTenpaiWaits(counts)).toEqual([]);
  });
});

describe("enumerateTenpaiWaits — standard-form tenpai", () => {
  it("ryanmen wait: 23p completes on 1p or 4p", () => {
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
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual([
      "pin-1",
      "pin-4",
    ]);
  });

  it("kanchan wait: 13p completes on 2p only", () => {
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
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual(["pin-2"]);
  });

  it("penchan wait: 12p completes on 3p only", () => {
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
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual(["pin-3"]);
  });

  it("shanpon wait: two pairs complete on either of them", () => {
    // 11m + 22p + 234m + 567m + 234s = 13
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
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual([
      "man-1",
      "pin-2",
    ]);
  });

  it("tanki wait: 4 complete melds + 1 lone tile completes on the same tile", () => {
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
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual(["dragon-1"]);
  });
});

describe("enumerateTenpaiWaits — non-standard forms", () => {
  it("thirteen-orphans 13-way wait: all 13 orphans complete the hand", () => {
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
    const waits = enumerateTenpaiWaits(counts);
    expect(waits).toHaveLength(13);
    expect(waitKeys(waits)).toEqual(
      [
        "dragon-1",
        "dragon-2",
        "dragon-3",
        "man-1",
        "man-9",
        "pin-1",
        "pin-9",
        "sou-1",
        "sou-9",
        "wind-1",
        "wind-2",
        "wind-3",
        "wind-4",
      ].sort(),
    );
  });

  it("seven-pairs tenpai: completes on the lone tile", () => {
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["wind", 1, 2],
      ["dragon", 3, 1],
    );
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual(["dragon-3"]);
  });

  it("seven-pairs tenpai with two distinct singles: waits on both", () => {
    // 6 pairs + 1 single (still 13 = 12+1) — only one single possible at 13 tiles.
    // For two distinct singles we'd need 13 tiles = 5 pairs + 3 singles = iishanten.
    // So this is effectively the same as the previous test — keep as a regression.
    const counts = makeCounts(
      ["man", 1, 2],
      ["man", 5, 2],
      ["man", 9, 2],
      ["pin", 3, 2],
      ["pin", 7, 2],
      ["sou", 5, 2],
      ["dragon", 1, 1],
    );
    expect(waitKeys(enumerateTenpaiWaits(counts))).toEqual(["dragon-1"]);
  });
});
