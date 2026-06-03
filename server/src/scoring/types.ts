/**
 * Core scoring-domain types.
 *
 * The scoring module operates on a 34-slot tile-type representation
 * (`TileCounts`) plus a small algebra of decompositions. Tile values use the
 * same `suit`/`rank` conventions as the `tile_types` seed:
 *   - numbered suits "man" / "pin" / "sou" have rank 1..9
 *   - honour suit "wind"   has rank 1..4 (East / South / West / North)
 *   - honour suit "dragon" has rank 1..3 (Red / White / Green)
 */

export type NumberedSuit = "man" | "pin" | "sou";
export type HonourSuit = "wind" | "dragon";
export type Suit = NumberedSuit | HonourSuit;

/** Re-export of the existing tile identity for the scoring API surface. */
export type { TileIdentity as Tile } from "../tiles/red-five.ts";

/** Wind ranks. Matches the `tile_types` seed (slot 1 = East). */
export const WIND_EAST = 1;
export const WIND_SOUTH = 2;
export const WIND_WEST = 3;
export const WIND_NORTH = 4;

export type WindRank =
  | typeof WIND_EAST
  | typeof WIND_SOUTH
  | typeof WIND_WEST
  | typeof WIND_NORTH;

/** Dragon ranks. Matches the `tile_types` seed (1=Red, 2=White, 3=Green). */
export const DRAGON_RED = 1;
export const DRAGON_WHITE = 2;
export const DRAGON_GREEN = 3;

export type DragonRank =
  | typeof DRAGON_RED
  | typeof DRAGON_WHITE
  | typeof DRAGON_GREEN;

/** A run (sequence / chii) — only valid in numbered suits. `rank` is the
 *  starting rank, so the run covers `rank`, `rank+1`, `rank+2` and must
 *  satisfy `1 <= rank <= 7`. */
export interface Run {
  kind: "run";
  suit: NumberedSuit;
  rank: number;
}

/** A triplet (pon) of three identical tiles. */
export interface Triplet {
  kind: "triplet";
  suit: Suit;
  rank: number;
}

/** A pair of two identical tiles. Standard hands have exactly one pair (the
 *  pivot); seven-pair hands have seven. */
export interface Pair {
  kind: "pair";
  suit: Suit;
  rank: number;
}

export type Meld = Run | Triplet | Pair;

/** A standard 4-meld + 1-pair winning shape. Meld order is canonical
 *  (man → pin → sou → wind → dragon, and ascending rank within each suit). */
export interface StandardDecomposition {
  form: "standard";
  melds: [Run | Triplet, Run | Triplet, Run | Triplet, Run | Triplet];
  pair: Pair;
}

/** A seven-pairs (chiitoitsu) winning shape. Pairs are ordered by tile index. */
export interface ChiitoitsuDecomposition {
  form: "chiitoitsu";
  pairs: [Pair, Pair, Pair, Pair, Pair, Pair, Pair];
}

/** A thirteen-orphans (kokushi musou) winning shape. The `pair` field
 *  identifies which of the 13 orphan tiles is doubled. */
export interface KokushiDecomposition {
  form: "kokushi";
  pair: Pair;
}

export type HandDecomposition =
  | StandardDecomposition
  | ChiitoitsuDecomposition
  | KokushiDecomposition;
