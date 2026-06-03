/**
 * Per-call scoring context.
 *
 * Captures everything outside of the decomposition that the yaku detectors
 * and fu/score functions need: round and seat winds, red-five bookkeeping,
 * and the tile that completed the hand (the 14th tile, always a tsumo draw
 * in this game). v1 has no concept of dealer (all wins are non-dealer
 * tsumo), so there is no `isDealer` field.
 */

import { tileIndex } from "./tile-counts.ts";
import type { WaitTile } from "./waits.ts";
import { WIND_EAST, WIND_NORTH, WIND_SOUTH, WIND_WEST, type WindRank } from "./types.ts";

export interface ScoringContext {
  /** This team's seat wind (1=East, 2=South, 3=West, 4=North). */
  seatWind: WindRank;
  /** The game's randomized round wind. */
  roundWind: WindRank;
  /** Whether the game treats `copyIndex === 0` of man/pin/sou 5 as a red five
   *  worth +1 han per copy. */
  redFivesEnabled: boolean;
  /** The 14th tile (the tile that completed the hand). All wins are tsumo. */
  winningTile: WaitTile;
}

/** Canonical wind tile-counts indices, keyed by `WindRank`. */
export const WIND_TILE_INDEX: Readonly<Record<WindRank, number>> = Object.freeze({
  [WIND_EAST]: tileIndex("wind", WIND_EAST),
  [WIND_SOUTH]: tileIndex("wind", WIND_SOUTH),
  [WIND_WEST]: tileIndex("wind", WIND_WEST),
  [WIND_NORTH]: tileIndex("wind", WIND_NORTH),
});
