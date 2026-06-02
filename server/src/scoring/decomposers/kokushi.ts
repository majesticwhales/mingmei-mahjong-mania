/**
 * Thirteen-orphans (kokushi musou) decomposer.
 *
 * Returns the single kokushi decomposition iff the hand consists of all 13
 * terminal-or-honour tile types with exactly one of them doubled. Any
 * non-orphan tile, any missing orphan, or any count ≥ 3 disqualifies the
 * hand.
 */

import type { KokushiDecomposition } from "../types.ts";
import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  indexToSuitRank,
  tileIndex,
  totalCount,
} from "../tile-counts.ts";

/** The thirteen terminal-or-honour tile indices, canonical order. */
const KOKUSHI_INDICES: readonly number[] = Object.freeze([
  tileIndex("man", 1),
  tileIndex("man", 9),
  tileIndex("pin", 1),
  tileIndex("pin", 9),
  tileIndex("sou", 1),
  tileIndex("sou", 9),
  tileIndex("wind", 1),
  tileIndex("wind", 2),
  tileIndex("wind", 3),
  tileIndex("wind", 4),
  tileIndex("dragon", 1),
  tileIndex("dragon", 2),
  tileIndex("dragon", 3),
]);

const KOKUSHI_INDEX_SET: ReadonlySet<number> = new Set(KOKUSHI_INDICES);

export function decomposeKokushi(counts: TileCounts): KokushiDecomposition[] {
  if (totalCount(counts) !== 14) return [];

  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    if (!KOKUSHI_INDEX_SET.has(i) && counts[i] !== 0) return [];
  }

  let pairIdx: number | null = null;
  for (const idx of KOKUSHI_INDICES) {
    const n = counts[idx];
    if (n === 0) return [];
    if (n === 1) continue;
    if (n === 2) {
      if (pairIdx !== null) return [];
      pairIdx = idx;
    } else {
      return [];
    }
  }

  if (pairIdx === null) return [];

  return [
    {
      form: "kokushi",
      pair: { kind: "pair", ...indexToSuitRank(pairIdx) },
    },
  ];
}
