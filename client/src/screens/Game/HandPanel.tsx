import { tileImagePath } from "../../lib/tileImages";
import type { HandTileDto } from "../../wire/projection";

interface Props {
  handTiles: HandTileDto[];
  open: boolean;
  onClose: () => void;
}

export function HandPanel({ handTiles, open, onClose }: Props) {
  const sortedTiles = [...handTiles].sort((a, b) => a.slotIndex - b.slotIndex);

  return (
    <aside
      className={`station-panel station-panel--hand${open ? " station-panel--open" : ""}`}
      aria-hidden={!open}
      aria-label="Your hand"
    >
      <div className="station-panel__handle" aria-hidden="true" />
      <header className="station-panel__header">
        <div>
          <p className="station-panel__eyebrow">Hand</p>
          <h2 className="station-panel__title">Your hand ({handTiles.length})</h2>
        </div>
        {open && (
          <button type="button" className="station-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <div className="station-panel__body">
        <ul className="station-panel__tile-grid station-panel__tile-grid--hand">
          {sortedTiles.map((tile) => (
            <li className="station-panel__tile" key={tile.instanceId}>
              <img
                src={tileImagePath(tile)}
                alt={tile.displayName}
                title={tile.displayName}
                className="station-panel__tile-image station-panel__tile-image--hand"
              />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
