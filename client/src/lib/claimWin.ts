import type { AnalyzedWaitDto, SlotTileDto, TileDto } from "../wire/projection";

/** Tenpai waits are keyed by tile type; any physical copy at the station counts. */
export function waitMatchesTile(
  wait: Pick<AnalyzedWaitDto, "tile">,
  tile: Pick<TileDto, "suit" | "rank">,
): boolean {
  return wait.tile.suit === tile.suit && wait.tile.rank === tile.rank;
}

export function stationHasClaimableWait(
  slots: ReadonlyArray<SlotTileDto>,
  waits: ReadonlyArray<AnalyzedWaitDto>,
): boolean {
  return slots.some((slot) => waits.some((wait) => waitMatchesTile(wait, slot.tile)));
}
