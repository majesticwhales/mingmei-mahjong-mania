/**
 * Dora bookkeeping.
 *
 * The dealer parks a small dead wall outside the playable game (chunk 1).
 * The first dead-wall tile is the *dora indicator*: it determines which
 * tile type is "dora" for scoring purposes by pointing at the next tile
 * in the canonical cycle for its suit. Each dora tile in the winning
 * hand contributes `+1 han`, but dora is **not** a yaku on its own — the
 * orchestrator only applies the bonus once the hand already has at least
 * one real yaku (mirrors the existing red-five rule).
 *
 * Canonical "next" cycles:
 *   - man / pin / sou: `1 → 2 → … → 9 → 1` (suited rank wraps around).
 *   - wind:            `East → South → West → North → East` (1 → 2 → 3 → 4 → 1).
 *   - dragon:          `Red → White → Green → Red`. Per the standard riichi
 *     dora rotation Haku → Hatsu → Chun → Haku, and our internal encoding
 *     `1 = Red, 2 = White, 3 = Green`, the cycle becomes
 *     `1 → 2 → 3 → 1`.
 *
 * All three cases collapse to `nextRank = (rank % length) + 1` where
 * `length` is `9` / `4` / `3`. We share that helper rather than carrying
 * three separate branches.
 *
 * v1 has no kans (so no ura-dora / kan-dora). Multiple indicators are
 * still supported by the API so future work can layer kan-dora on without
 * a signature break.
 */

import type { NumberedSuit, Suit, Tile } from "./types.ts";

/**
 * A revealed dora indicator. Just a tile type — the `copyIndex` of the
 * physical dead-wall tile doesn't affect scoring, and red-five copies
 * never appear in the dead wall in any meaningful way for dora purposes
 * (the indicator points to *the next tile type*; its copy identity is
 * irrelevant).
 */
export interface DoraIndicator {
  suit: Suit;
  rank: number;
}

const SUIT_CYCLE_LENGTH: Readonly<Record<Suit, number>> = Object.freeze({
  man: 9,
  pin: 9,
  sou: 9,
  wind: 4,
  dragon: 3,
});

function isNumberedSuit(suit: Suit): suit is NumberedSuit {
  return suit === "man" || suit === "pin" || suit === "sou";
}

/**
 * Map an indicator tile type to the dora tile type. Honour-suit indicators
 * wrap within their honour cycle (winds within 1..4, dragons within 1..3);
 * suited indicators wrap within 1..9.
 *
 * Throws on out-of-range ranks rather than silently producing nonsense
 * tile types — the projection layer validates indicators sourced from
 * `tile_types`, so this is a defensive check for direct callers.
 */
export function indicatorToDoraTileType(
  indicator: DoraIndicator,
): { suit: Suit; rank: number } {
  const length = SUIT_CYCLE_LENGTH[indicator.suit];
  if (length === undefined) {
    throw new Error(
      `Unrecognised suit "${indicator.suit}" for dora indicator`,
    );
  }
  if (
    !Number.isInteger(indicator.rank) ||
    indicator.rank < 1 ||
    indicator.rank > length
  ) {
    throw new Error(
      `Invalid rank ${indicator.rank} for ${indicator.suit} dora indicator (expected 1..${length})`,
    );
  }
  // For numbered suits we narrow the result type to `NumberedSuit` so
  // downstream callers don't have to re-check.
  const nextRank = (indicator.rank % length) + 1;
  if (isNumberedSuit(indicator.suit)) {
    return { suit: indicator.suit, rank: nextRank };
  }
  return { suit: indicator.suit, rank: nextRank };
}

/**
 * Count how many tiles in the hand match the dora tile types implied by
 * the given indicators. Each indicator is evaluated independently and
 * contributes its own column to the total, so two indicators that happen
 * to point at the same dora tile type stack (each matching hand tile is
 * worth `+1 han per matching indicator`). This matches the riichi
 * convention of one han per dora copy per indicator.
 *
 * Hand tiles are compared by `(suit, rank)` — `copyIndex` is irrelevant
 * here since dora applies to every copy of the matching tile type.
 */
export function countDora(
  tiles: ReadonlyArray<Tile>,
  indicators: ReadonlyArray<DoraIndicator>,
): number {
  if (indicators.length === 0) return 0;
  const doraTypes = indicators.map(indicatorToDoraTileType);
  let count = 0;
  for (const tile of tiles) {
    for (const dora of doraTypes) {
      if (tile.suit === dora.suit && tile.rank === dora.rank) count += 1;
    }
  }
  return count;
}
