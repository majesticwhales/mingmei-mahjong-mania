/**
 * Shared predicates and tile-walking helpers for yaku detectors.
 *
 * Pure utilities only — no side effects, no shared mutable state.
 */

import type {
  HandDecomposition,
  Meld,
  Pair,
  Run,
  StandardDecomposition,
  Suit,
  Triplet,
} from "../types.ts";
import { ORPHAN_TILE_INDICES } from "../tile-sets.ts";
import { indexToSuitRank, tileIndex } from "../tile-counts.ts";

/** A bare tile-type with no copyIndex. */
export interface TileType {
  suit: Suit;
  rank: number;
}

export function isNumberedSuit(suit: Suit): boolean {
  return suit === "man" || suit === "pin" || suit === "sou";
}

export function isHonourSuit(suit: Suit): boolean {
  return suit === "wind" || suit === "dragon";
}

export function isTerminalRank(rank: number): boolean {
  return rank === 1 || rank === 9;
}

export function isTerminalOrHonour(suit: Suit, rank: number): boolean {
  return isHonourSuit(suit) || (isNumberedSuit(suit) && isTerminalRank(rank));
}

export function isSimple(suit: Suit, rank: number): boolean {
  return isNumberedSuit(suit) && rank >= 2 && rank <= 8;
}

/** Expand a single meld or pair into its individual tile-types. */
export function meldTiles(group: Meld | Pair): TileType[] {
  if (group.kind === "run") {
    return [
      { suit: group.suit, rank: group.rank },
      { suit: group.suit, rank: group.rank + 1 },
      { suit: group.suit, rank: group.rank + 2 },
    ];
  }
  const copies = group.kind === "triplet" ? 3 : 2;
  const tiles: TileType[] = [];
  for (let i = 0; i < copies; i += 1) {
    tiles.push({ suit: group.suit, rank: group.rank });
  }
  return tiles;
}

/** Return every tile (with repetition) in the decomposition's 14-tile hand. */
export function decompositionTiles(decomp: HandDecomposition): TileType[] {
  if (decomp.form === "standard") {
    const tiles: TileType[] = [];
    for (const meld of decomp.melds) tiles.push(...meldTiles(meld));
    tiles.push(...meldTiles(decomp.pair));
    return tiles;
  }
  if (decomp.form === "chiitoitsu") {
    const tiles: TileType[] = [];
    for (const p of decomp.pairs) tiles.push(...meldTiles(p));
    return tiles;
  }
  // kokushi: 13 distinct orphans, with one of them doubled.
  const tiles: TileType[] = [];
  const pairIdx = tileIndex(decomp.pair.suit, decomp.pair.rank);
  for (const idx of ORPHAN_TILE_INDICES) {
    const t = indexToSuitRank(idx);
    tiles.push(t);
    if (idx === pairIdx) tiles.push(t);
  }
  return tiles;
}

/** Whether a meld contains a terminal (1/9) or honour tile anywhere. */
export function meldTouchesOutside(meld: Meld | Pair): boolean {
  if (meld.kind === "run") {
    return meld.rank === 1 || meld.rank + 2 === 9;
  }
  return isTerminalOrHonour(meld.suit, meld.rank);
}

/** Classify the wait shape implied by the winning tile sitting inside this
 *  decomposition. Returns `"ryanmen"` if the winning tile completes a run
 *  via a 2-sided wait at either end of the run; otherwise returns one of
 *  the other shapes (or `null` if the winning tile doesn't appear in any
 *  meld — should not occur for a valid input). */
export function classifyStandardWait(
  decomp: StandardDecomposition,
  winningTile: TileType,
): "ryanmen" | "penchan" | "kanchan" | "shanpon" | "tanki" | null {
  if (
    decomp.pair.suit === winningTile.suit &&
    decomp.pair.rank === winningTile.rank
  ) {
    return "tanki";
  }

  let best: "ryanmen" | "penchan" | "kanchan" | "shanpon" | null = null;
  for (const meld of decomp.melds) {
    if (meld.kind === "triplet") {
      if (meld.suit === winningTile.suit && meld.rank === winningTile.rank) {
        best ??= "shanpon";
      }
      continue;
    }
    if (meld.suit !== winningTile.suit) continue;
    const rel = winningTile.rank - meld.rank;
    if (rel === 0) {
      // Leftmost slot of the run: proto was (rank+1, rank+2). Ryanmen iff
      // there's room on the *other* side (rank+3 ≤ 9), i.e., meld.rank ≤ 6.
      best = meld.rank <= 6 ? "ryanmen" : best ?? "penchan";
    } else if (rel === 2) {
      // Rightmost slot: proto was (rank, rank+1). Ryanmen iff there's room on
      // the *other* side (rank-1 ≥ 1), i.e., meld.rank ≥ 2.
      best = meld.rank >= 2 ? "ryanmen" : best ?? "penchan";
    } else if (rel === 1) {
      best ??= "kanchan";
    }
    if (best === "ryanmen") return "ryanmen";
  }
  return best;
}

export function meldsOnly(
  decomp: StandardDecomposition,
): ReadonlyArray<Run | Triplet> {
  return decomp.melds;
}
