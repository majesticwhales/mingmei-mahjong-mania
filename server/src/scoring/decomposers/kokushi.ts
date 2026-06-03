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
  totalCount,
} from "../tile-counts.ts";
import {
  ORPHAN_TILE_INDEX_SET,
  ORPHAN_TILE_INDICES,
} from "../tile-sets.ts";

export function decomposeKokushi(counts: TileCounts): KokushiDecomposition[] {
  if (totalCount(counts) !== 14) return [];

  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    if (!ORPHAN_TILE_INDEX_SET.has(i) && counts[i] !== 0) return [];
  }

  let pairIdx: number | null = null;
  for (const idx of ORPHAN_TILE_INDICES) {
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
