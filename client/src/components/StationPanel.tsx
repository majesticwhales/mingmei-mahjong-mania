import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { isTileStation, TILES_PER_STATION } from "../data/tileStations";
import type { SubwayLine } from "../data/types";
import { tileImagePath } from "../lib/tileImages";
import type {
  AtStationDto,
  HandTileDto,
  MapNodeDto,
  MapNodeTileDto,
  SlotTileDto,
  TileDto,
} from "../wire/projection";

interface Props {
  atStation: AtStationDto | null;
  viewingNode: MapNodeDto | null;
  checkedInNodeName: string | null;
  stationLines?: SubwayLine[];
  handTiles: HandTileDto[];
  commandsPending?: boolean;
  checkInPending?: boolean;
  commandsDisabled?: boolean;
  /**
   * Phase J — when `true`, show a "Claim hand" button alongside Swap.
   * The parent decides this from `(handAnalysis.shanten === 0 && some
   * station tile matches a wait)`; the panel only renders.
   */
  canClaimWin?: boolean;
  onClose: () => void;
  onCheckIn: (nodeId: string) => void;
  onCheckOut: () => void;
  onSwapTile: () => void;
  onClaimWin?: () => void;
}

/**
 * Phase L §3.13: `MapNodeTileDto[]` is the server-resolved exhaustive
 * per-slot view. Project it down to the legacy `SlotTileDto[]` shape
 * (only the slots with a visible placement) so the existing render
 * helpers can stay unchanged. `atStation.tiles[]` is still legacy
 * `SlotTileDto[]` in L3; see TDD §3.13 for the L4 rewire.
 */
function nodeTilesToSlotTiles(tiles: MapNodeTileDto[]): SlotTileDto[] {
  const out: SlotTileDto[] = [];
  for (const entry of tiles) {
    if (entry.visible && entry.tile != null) {
      out.push({ slotIndex: entry.slotIndex, tile: entry.tile });
    }
  }
  return out;
}

function tilesBySlot(tiles: SlotTileDto[] | undefined) {
  const bySlot = new Map<number, TileDto>();
  if (tiles) {
    for (const entry of tiles) {
      bySlot.set(entry.slotIndex, entry.tile);
    }
  }
  return bySlot;
}

function renderTripleStationSlots(tiles: SlotTileDto[] | undefined) {
  const known = tilesBySlot(tiles);
  return Array.from({ length: TILES_PER_STATION }, (_, slotIndex) => {
    const tile = known.get(slotIndex);
    if (tile) {
      return (
        <div key={slotIndex} className="station-panel__slot">
          <span className="station-panel__slot-label">Slot {slotIndex + 1}</span>
          <img
            src={tileImagePath(tile)}
            alt={tile.displayName}
            className="station-panel__tile-image station-panel__tile-image--station-slot"
          />
          <p className="station-panel__tile-name">{tile.displayName}</p>
        </div>
      );
    }
    return (
      <div key={slotIndex} className="station-panel__slot station-panel__slot--unknown">
        <span className="station-panel__slot-label">Slot {slotIndex + 1}</span>
        <img
          src={TILE_BACK_IMAGE_PATH}
          alt=""
          className="station-panel__tile-image station-panel__tile-image--station-slot station-panel__tile-image--hidden"
        />
        <p className="station-panel__tile-name">Unknown</p>
      </div>
    );
  });
}

function renderLegacyStationTiles(
  tiles: SlotTileDto[] | undefined,
  single?: TileDto,
) {
  if (tiles?.length) {
    return tiles.map((slot) => (
      <div key={slot.slotIndex} className="station-panel__slot">
        <span className="station-panel__slot-label">Slot {slot.slotIndex + 1}</span>
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
  viewingNode: MapNodeDto,
  atStation: AtStationDto | null,
  isViewingCheckedInStation: boolean,
) {
  // Phase L §3.13: when the team is at the station, the engine
  // overrides the per-slot map gate (every station tile is visible at
  // atStation regardless of map fog); use the legacy `atStation.tiles`
  // path. Otherwise we project the exhaustive `MapNodeTileDto[]` down
  // to the visible-only `SlotTileDto[]` shape the renderer expects.
  if (isViewingCheckedInStation && atStation) {
    if (isTileStation(viewingNode.code)) {
      return renderTripleStationSlots(atStation.tiles);
    }
    return renderLegacyStationTiles(atStation.tiles, atStation.tile);
  }

  const slotTiles = nodeTilesToSlotTiles(viewingNode.tiles);
  if (isTileStation(viewingNode.code)) {
    return renderTripleStationSlots(slotTiles);
  }
  return renderLegacyStationTiles(slotTiles);
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
  canClaimWin = false,
  onClose,
  onCheckIn,
  onCheckOut,
  onSwapTile,
  onClaimWin,
}: Props) {
  const isOpen = Boolean(viewingNode);
  const checkedInId = atStation?.nodeId ?? null;
  const viewingId = viewingNode?.id ?? null;
  const isViewingCheckedInStation =
    viewingId != null && checkedInId != null && viewingId === checkedInId;
  const isBrowsingElsewhere =
    viewingId != null && checkedInId != null && viewingId !== checkedInId;
  const showCheckIn = viewingId != null && !isViewingCheckedInStation;
  const stationTiles = viewingNode
    ? stationTilesForView(viewingNode, atStation, isViewingCheckedInStation)
    : null;
  const stationSlotsTriple = Boolean(viewingNode && isTileStation(viewingNode.code));
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
            <div
              className={`station-panel__slots${
                stationSlotsTriple ? " station-panel__slots--triple" : ""
              }`}
            >
              {stationTiles}
            </div>
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
            {canClaimWin && onClaimWin && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={actionsDisabled}
                onClick={onClaimWin}
              >
                Claim hand
              </button>
            )}
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
