/**
 * Tenpai-wait enumeration.
 *
 * Given a 13-tile hand, return the list of tile types that, when added as
 * the 14th tile, complete a winning shape under any decomposition form
 * (standard / chiitoitsu / kokushi).
 *
 * The result deliberately uses a "tile-type" shape (`{ suit, rank }`) rather
 * than full `Tile` identities — the scoring module reasons in terms of tile
 * types, and the orchestrator (chunk 6) attaches a `TileIdentity` (with the
 * appropriate `copyIndex`, including potential red-five interpretation) when
 * surfacing waits in the public API.
 */

import { computeShanten } from "./shanten.ts";
import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  indexToSuitRank,
  totalCount,
} from "./tile-counts.ts";
import type { Suit } from "./types.ts";

export interface WaitTile {
  suit: Suit;
  rank: number;
}

export function enumerateTenpaiWaits(counts: TileCounts): WaitTile[] {
  if (totalCount(counts) !== 13) return [];

  const waits: WaitTile[] = [];
  const mutable = new Uint8Array(counts);

  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    if (mutable[i] >= 4) continue; // no more copies of this tile type available
    mutable[i] += 1;
    const shanten = computeShanten(mutable);
    mutable[i] -= 1;
    if (shanten === -1) {
      waits.push(indexToSuitRank(i));
    }
  }

  return waits;
}
