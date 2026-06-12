import { useMemo, useState } from "react";
import { tileImagePath } from "../../lib/tileImages";
import type {
  HandTileDto,
  MapNodeTileDto,
  TileDto,
} from "../../wire/projection";

interface SwappableSlot {
  slotIndex: number;
  tile: TileDto;
}

interface Props {
  handTiles: HandTileDto[];
  /**
   * Phase L Chunk 4 B-2: exhaustive per-slot `MapNodeTileDto[]` from
   * `atStation.tiles[]`. Hidden / locked entries (those with
   * `tile === null`) are filtered out below — only slots with a
   * visible tile become swap targets.
   */
  stationTiles: MapNodeTileDto[] | undefined;
  onConfirm: (handTileId: string, stationTileId: string, slotIndex?: number) => void;
  onClose: () => void;
}

function resolveStationSlots(
  stationTiles: MapNodeTileDto[] | undefined,
): SwappableSlot[] {
  if (!stationTiles?.length) return [];
  const out: SwappableSlot[] = [];
  for (const entry of stationTiles) {
    if (entry.tile != null) {
      out.push({ slotIndex: entry.slotIndex, tile: entry.tile });
    }
  }
  return out;
}

export function SwapTileModal({
  handTiles,
  stationTiles,
  onConfirm,
  onClose,
}: Props) {
  const slots = useMemo(
    () => resolveStationSlots(stationTiles),
    [stationTiles],
  );
  const defaultStation = slots.length === 1 ? slots[0]! : null;

  const [handTileId, setHandTileId] = useState<string | null>(null);
  const [stationTileId, setStationTileId] = useState<string | null>(
    () => defaultStation?.tile.instanceId ?? null,
  );
  const [slotIndex, setSlotIndex] = useState<number | null>(
    () => defaultStation?.slotIndex ?? null,
  );

  const canConfirm = Boolean(handTileId && stationTileId);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h2>Swap tile</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </header>
        <p className="modal__hint">
          Pick one tile from your hand
          {slots.length === 1 ? " — the station tile is already selected." : " and one from the station."}
        </p>
        <section>
          <h3>Your hand</h3>
          <ul className="station-panel__tile-grid">
            {handTiles.map((tile) => (
              <li key={tile.instanceId}>
                <button
                  type="button"
                  className={`tile-pick${handTileId === tile.instanceId ? " tile-pick--selected" : ""}`}
                  onClick={() => setHandTileId(tile.instanceId)}
                >
                  <img src={tileImagePath(tile)} alt={tile.displayName} className="station-panel__tile-image" />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Station tile</h3>
          {slots.length === 0 && (
            <p className="station-panel__empty">No tiles at this station to swap.</p>
          )}
          <ul className="station-panel__tile-grid">
            {slots.map((slot) => (
              <li key={slot.slotIndex}>
                <button
                  type="button"
                  className={`tile-pick${stationTileId === slot.tile.instanceId ? " tile-pick--selected" : ""}`}
                  onClick={() => {
                    setStationTileId(slot.tile.instanceId);
                    setSlotIndex(slot.slotIndex);
                  }}
                >
                  <img
                    src={tileImagePath(slot.tile)}
                    alt={slot.tile.displayName}
                    className="station-panel__tile-image"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <footer className="modal__footer">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canConfirm}
            onClick={() => onConfirm(handTileId!, stationTileId!, slotIndex ?? undefined)}
          >
            Confirm swap
          </button>
        </footer>
      </div>
    </div>
  );
}
