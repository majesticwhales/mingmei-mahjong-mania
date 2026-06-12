import type {
  AnalyzedWaitDto,
  MapNodeTileDto,
  TileDto,
} from "../wire/projection";

/** Tenpai waits are keyed by tile type; any physical copy at the station counts. */
export function waitMatchesTile(
  wait: Pick<AnalyzedWaitDto, "tile">,
  tile: Pick<TileDto, "suit" | "rank">,
): boolean {
  return wait.tile.suit === tile.suit && wait.tile.rank === tile.rank;
}

/**
 * Phase L Chunk 4 B-2: consumes the exhaustive `MapNodeTileDto[]`
 * shape (the same one emitted on `atStation.tiles[]` and
 * `mapNodes[].tiles[]`). Hidden / locked slots have `tile: null` —
 * those slots are never claimable, so we filter them out before
 * matching against the team's tenpai waits.
 */
export function stationHasClaimableWait(
  slots: ReadonlyArray<MapNodeTileDto>,
  waits: ReadonlyArray<AnalyzedWaitDto>,
): boolean {
  return slots.some((slot) => {
    if (slot.tile == null) return false;
    return waits.some((wait) => waitMatchesTile(wait, slot.tile!));
  });
}
