/**
 * Named tile-set constants used by multiple scoring sub-modules.
 *
 * Kept in one place so the decomposers, shanten algorithm, and yaku
 * detectors all reference identical canonical lists.
 */

import { tileIndex } from "./tile-counts.ts";

/** The 13 terminal-or-honour ("orphan") tile indices, canonical order. */
export const ORPHAN_TILE_INDICES: readonly number[] = Object.freeze([
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

export const ORPHAN_TILE_INDEX_SET: ReadonlySet<number> = new Set(
  ORPHAN_TILE_INDICES,
);
