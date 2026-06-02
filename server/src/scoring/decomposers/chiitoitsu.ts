/**
 * Seven-pairs (chiitoitsu) decomposer.
 *
 * Returns the single seven-pairs decomposition iff the hand has exactly 7
 * distinct tile types, each appearing exactly twice. Quads (4-of-a-kind)
 * are *not* treated as two pairs — standard riichi convention.
 */

import type { ChiitoitsuDecomposition, Pair } from "../types.ts";
import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  indexToSuitRank,
  totalCount,
} from "../tile-counts.ts";

export function decomposeChiitoitsu(
  counts: TileCounts,
): ChiitoitsuDecomposition[] {
  if (totalCount(counts) !== 14) return [];

  const pairs: Pair[] = [];
  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    const n = counts[i];
    if (n === 0) continue;
    if (n !== 2) return [];
    pairs.push({ kind: "pair", ...indexToSuitRank(i) });
  }
  if (pairs.length !== 7) return [];

  return [
    {
      form: "chiitoitsu",
      pairs: pairs as ChiitoitsuDecomposition["pairs"],
    },
  ];
}
