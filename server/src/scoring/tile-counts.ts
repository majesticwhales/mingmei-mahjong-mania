/**
 * Flat-array tile-count representation used throughout the scoring module.
 *
 * Tile-index layout (length 34):
 *   0..8   man    rank 1..9
 *   9..17  pin    rank 1..9
 *   18..26 sou    rank 1..9
 *   27..30 wind   rank 1..4 (East / South / West / North)
 *   31..33 dragon rank 1..3 (Red / White / Green)
 *
 * Counts are stored as `Uint8Array` to avoid object churn in the inner
 * decomposer loops; each slot's value is in `0..4`.
 */

import type { Suit, Tile } from "./types.ts";

export type TileCounts = Uint8Array;

export const TILE_COUNTS_LENGTH = 34;

const SUIT_OFFSETS: Record<Suit, number> = {
  man: 0,
  pin: 9,
  sou: 18,
  wind: 27,
  dragon: 31,
};

const SUIT_LENGTHS: Record<Suit, number> = {
  man: 9,
  pin: 9,
  sou: 9,
  wind: 4,
  dragon: 3,
};

const SUPPORTED_SUITS = new Set<string>([
  "man",
  "pin",
  "sou",
  "wind",
  "dragon",
]);

function isScoringSuit(suit: string): suit is Suit {
  return SUPPORTED_SUITS.has(suit);
}

/** Compute the flat-array index for a `(suit, rank)` pair. Throws on
 *  out-of-range rank or unrecognised suit. */
export function tileIndex(suit: Suit, rank: number): number {
  const offset = SUIT_OFFSETS[suit];
  const length = SUIT_LENGTHS[suit];
  if (!Number.isInteger(rank) || rank < 1 || rank > length) {
    throw new Error(
      `Invalid rank ${rank} for suit "${suit}" (expected 1..${length})`,
    );
  }
  return offset + (rank - 1);
}

/** Inverse of `tileIndex`. */
export function indexToSuitRank(index: number): { suit: Suit; rank: number } {
  if (!Number.isInteger(index) || index < 0 || index >= TILE_COUNTS_LENGTH) {
    throw new Error(
      `Invalid tile index ${index} (expected 0..${TILE_COUNTS_LENGTH - 1})`,
    );
  }
  if (index < 9) return { suit: "man", rank: index + 1 };
  if (index < 18) return { suit: "pin", rank: index - 8 };
  if (index < 27) return { suit: "sou", rank: index - 17 };
  if (index < 31) return { suit: "wind", rank: index - 26 };
  return { suit: "dragon", rank: index - 30 };
}

/** Convert tile identities into the flat count representation. Throws on
 *  unrecognised suits; ignores `copyIndex` (the scoring layer treats
 *  identical-rank tiles as interchangeable). */
export function tilesToCounts(tiles: readonly Tile[]): TileCounts {
  const counts = new Uint8Array(TILE_COUNTS_LENGTH);
  for (const tile of tiles) {
    if (!isScoringSuit(tile.suit)) {
      throw new Error(`Unrecognised suit "${tile.suit}" in scoring input`);
    }
    counts[tileIndex(tile.suit, tile.rank)] += 1;
  }
  return counts;
}

/** Inverse of `tilesToCounts`. Resulting tiles use sequential `copyIndex`
 *  values per tile type (0..N-1) since the counts representation discards
 *  copy identity. */
export function countsToTiles(counts: TileCounts): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    const n = counts[i];
    if (n === 0) continue;
    const { suit, rank } = indexToSuitRank(i);
    for (let copy = 0; copy < n; copy++) {
      tiles.push({ suit, rank, copyIndex: copy });
    }
  }
  return tiles;
}

export function cloneCounts(counts: TileCounts): TileCounts {
  return new Uint8Array(counts);
}

export function totalCount(counts: TileCounts): number {
  let total = 0;
  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) total += counts[i];
  return total;
}

/** Internal helper: extract a per-suit slice as a plain mutable number array
 *  for decomposer use. Decomposers mutate-and-restore this array; the source
 *  counts are not affected. */
export function suitSlice(counts: TileCounts, suit: Suit): number[] {
  const offset = SUIT_OFFSETS[suit];
  const length = SUIT_LENGTHS[suit];
  const out = new Array<number>(length);
  for (let i = 0; i < length; i++) out[i] = counts[offset + i];
  return out;
}

export function suitOffset(suit: Suit): number {
  return SUIT_OFFSETS[suit];
}

export function suitLength(suit: Suit): number {
  return SUIT_LENGTHS[suit];
}
