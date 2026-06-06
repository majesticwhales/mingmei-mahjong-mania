import { tileImagePath } from "../lib/tileImages";
import type { AtStationDto } from "../wire/projection";
import type { HandTileDto, SlotTileDto, TileDto } from "../wire/projection";

interface Props {
  atStation: AtStationDto | null;
  selectedNodeId: string | null;
  selectedNodeName: string | null;
  handTiles: HandTileDto[];
  onClose: () => void;
  onCheckIn: (nodeId: string) => void;
  onCheckOut: () => void;
  onSwapTile: () => void;
}

function renderSlotTiles(tiles: SlotTileDto[] | undefined, single?: TileDto) {
  if (tiles?.length) {
    return tiles.map((slot) => (
      <div key={slot.slotIndex} className="station-panel__slot">
        <span className="station-panel__slot-label">slot {slot.slotIndex}</span>
        <img
          src={tileImagePath(slot.tile)}
          alt={slot.tile.displayName}
          className="station-panel__tile-image station-panel__tile-image--large"
        />
        <p className="station-panel__tile-name">{slot.tile.displayName}</p>
      </div>
    ));
  }
  if (single) {
    return (
      <div className="station-panel__slot">
        <img
          src={tileImagePath(single)}
          alt={single.displayName}
          className="station-panel__tile-image station-panel__tile-image--large"
        />
        <p className="station-panel__tile-name">{single.displayName}</p>
      </div>
    );
  }
  return null;
}

export function StationPanel({
  atStation,
  selectedNodeId,
  selectedNodeName,
  handTiles,
  onClose,
  onCheckIn,
  onCheckOut,
  onSwapTile,
}: Props) {
  const isOpen = Boolean(atStation || selectedNodeId);
  const showCheckIn = !atStation && selectedNodeId;

  return (
    <aside
      className={`station-panel${isOpen ? " station-panel--open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Station details"
    >
      <div className="station-panel__handle" aria-hidden="true" />
      <header className="station-panel__header">
        <div>
          <p className="station-panel__eyebrow">
            {atStation ? `At: ${atStation.code}` : "Station"}
          </p>
          <h2 className="station-panel__title">
            {atStation ? selectedNodeName ?? atStation.code : selectedNodeName ?? "Pick a station"}
          </h2>
        </div>
        {isOpen && (
          <button type="button" className="station-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <div className="station-panel__body">
        {showCheckIn && (
          <button type="button" className="btn btn--primary btn--block" onClick={() => onCheckIn(selectedNodeId!)}>
            Check in here
          </button>
        )}
        {atStation && (
          <>
            <section>
              <h3 className="station-panel__section-title">Station tiles</h3>
              <div className="station-panel__slots">{renderSlotTiles(atStation.tiles, atStation.tile)}</div>
            </section>
            <div className="station-panel__actions">
              <button type="button" className="btn btn--secondary" onClick={onSwapTile}>
                Swap tile
              </button>
              <button type="button" className="btn btn--danger" onClick={onCheckOut}>
                Check out
              </button>
            </div>
          </>
        )}
        <section>
          <h3 className="station-panel__section-title">Your hand ({handTiles.length})</h3>
          <ul className="station-panel__tile-grid">
            {handTiles.map((tile) => (
              <li className="station-panel__tile" key={tile.instanceId}>
                <img
                  src={tileImagePath(tile)}
                  alt={tile.displayName}
                  title={tile.displayName}
                  className="station-panel__tile-image"
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
