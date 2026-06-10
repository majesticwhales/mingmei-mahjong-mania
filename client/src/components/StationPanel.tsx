import type { SubwayLine } from "../data/types";
import { tileImagePath } from "../lib/tileImages";
import type { AtStationDto, HandTileDto, MapNodeDto, SlotTileDto, TileDto } from "../wire/projection";

interface Props {
  atStation: AtStationDto | null;
  viewingNode: MapNodeDto | null;
  checkedInNodeName: string | null;
  stationLines?: SubwayLine[];
  handTiles: HandTileDto[];
  commandsPending?: boolean;
  checkInPending?: boolean;
  commandsDisabled?: boolean;
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

function stationTilesForView(
  viewingNode: MapNodeDto | null,
  atStation: AtStationDto | null,
  isViewingCheckedInStation: boolean,
) {
  if (!viewingNode) return null;
  if (isViewingCheckedInStation && atStation) {
    return renderSlotTiles(atStation.tiles, atStation.tile);
  }
  return renderSlotTiles(viewingNode.tiles, viewingNode.tile);
}

export function StationPanel({
  atStation,
  viewingNode,
  checkedInNodeName,
  stationLines = [],
  handTiles,
  commandsPending = false,
  checkInPending = false,
  commandsDisabled = false,
  onClose,
  onCheckIn,
  onCheckOut,
  onSwapTile,
}: Props) {
  const isOpen = Boolean(viewingNode);
  const checkedInId = atStation?.nodeId ?? null;
  const viewingId = viewingNode?.id ?? null;
  const isViewingCheckedInStation =
    viewingId != null && checkedInId != null && viewingId === checkedInId;
  const isBrowsingElsewhere =
    viewingId != null && checkedInId != null && viewingId !== checkedInId;
  const showCheckIn = viewingId != null && !isViewingCheckedInStation;
  const stationTiles = stationTilesForView(viewingNode, atStation, isViewingCheckedInStation);
  const actionsDisabled = commandsPending || commandsDisabled || checkInPending;

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
            {isViewingCheckedInStation
              ? `At: ${atStation!.code}`
              : isBrowsingElsewhere
                ? `Checked in at ${checkedInNodeName ?? atStation!.code}`
                : "Station"}
          </p>
          <h2 className="station-panel__title">
            {viewingNode?.name ?? "Pick a station"}
          </h2>
        </div>
        {isOpen && (
          <button type="button" className="station-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <div className="station-panel__body">
        {!viewingNode && (
          <p className="station-panel__empty">
            Tap any station on the map to check in or inspect tiles along your route.
          </p>
        )}
        {stationLines.length > 0 && (
          <section>
            <h3 className="station-panel__section-title">Lines</h3>
            <ul className="station-panel__lines">
              {stationLines.map((line) => (
                <li key={line.id} className="station-panel__line">
                  <span className="station-panel__swatch" style={{ background: line.color }} aria-hidden="true" />
                  <span>{line.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {viewingNode && stationTiles && (
          <section>
            <h3 className="station-panel__section-title">Station tiles</h3>
            <div className="station-panel__slots">{stationTiles}</div>
          </section>
        )}
        {showCheckIn && (
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={actionsDisabled}
            onClick={() => onCheckIn(viewingId!)}
          >
            {checkInPending
              ? "Checking in…"
              : isBrowsingElsewhere
                ? "Move here"
                : "Check in here"}
          </button>
        )}
        {isViewingCheckedInStation && atStation && (
          <div className="station-panel__actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={actionsDisabled}
              onClick={onSwapTile}
            >
              Swap tile
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={actionsDisabled}
              onClick={onCheckOut}
            >
              Check out
            </button>
          </div>
        )}
        {isBrowsingElsewhere && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            disabled={actionsDisabled}
            onClick={onCheckOut}
          >
            Check out from {checkedInNodeName ?? atStation!.code}
          </button>
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
