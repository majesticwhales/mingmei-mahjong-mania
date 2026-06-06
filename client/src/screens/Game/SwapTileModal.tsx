import { useState } from "react";
import { tileImagePath } from "../../lib/tileImages";
import type { HandTileDto, SlotTileDto, TileDto } from "../../wire/projection";

interface Props {
  handTiles: HandTileDto[];
  stationTiles: SlotTileDto[] | undefined;
  stationTile: TileDto | undefined;
  onConfirm: (handTileId: string, stationTileId: string, slotIndex?: number) => void;
  onClose: () => void;
}

export function SwapTileModal({
  handTiles,
  stationTiles,
  stationTile,
  onConfirm,
  onClose,
}: Props) {
  const [handTileId, setHandTileId] = useState<string | null>(null);
  const [stationTileId, setStationTileId] = useState<string | null>(null);
  const [slotIndex, setSlotIndex] = useState<number | null>(null);

  const slots =
    stationTiles ??
    (stationTile ? [{ slotIndex: 0, tile: stationTile }] : []);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h2>Swap tile</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </header>
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
            disabled={!handTileId || !stationTileId}
            onClick={() => onConfirm(handTileId!, stationTileId!, slotIndex ?? undefined)}
          >
            Confirm swap
          </button>
        </footer>
      </div>
    </div>
  );
}
