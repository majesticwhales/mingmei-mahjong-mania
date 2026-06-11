import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { isTileStation, TILES_PER_STATION } from "../data/tileStations";
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
  /**
   * Phase J — when `true`, show a "Claim hand" button alongside Swap.
   * The parent decides this from `(handAnalysis.shanten === 0 && some
   * station tile matches a wait)`; the panel only renders.
   */
  canClaimWin?: boolean;
  showSwapTile?: boolean;
  showChallenge?: boolean;
  challengeCooldownUntil?: string;
  onClose: () => void;
  onCheckIn: (nodeId: string) => void;
  onCheckOut: () => void;
  onSwapTile: () => void;
  onOpenChallenge?: () => void;
  onClaimWin?: () => void;
}

function tilesBySlot(tiles: SlotTileDto[] | undefined, single?: TileDto) {
  const bySlot = new Map<number, TileDto>();
  if (tiles) {
    for (const entry of tiles) {
      bySlot.set(entry.slotIndex, entry.tile);
    }
  } else if (single) {
    bySlot.set(0, single);
  }
  return bySlot;
}

function renderTripleStationSlots(tiles: SlotTileDto[] | undefined, single?: TileDto) {
  const known = tilesBySlot(tiles, single);
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

function renderLegacyStationTiles(tiles: SlotTileDto[] | undefined, single?: TileDto) {
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
  const atStationMatchesView = atStation?.nodeId === viewingNode.id;
  const useAtStationTiles = isViewingCheckedInStation && atStationMatchesView && atStation;
  const tiles = useAtStationTiles ? atStation.tiles : viewingNode.tiles;
  const single = useAtStationTiles ? atStation.tile : viewingNode.tile;

  if (isTileStation(viewingNode.code)) {
    return renderTripleStationSlots(tiles, single);
  }
  return renderLegacyStationTiles(tiles, single);
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
  showSwapTile = true,
  showChallenge = false,
  challengeCooldownUntil,
  onClose,
  onCheckIn,
  onCheckOut,
  onSwapTile,
  onOpenChallenge,
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
            {showChallenge && onOpenChallenge && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={actionsDisabled}
                onClick={onOpenChallenge}
              >
                View challenge
              </button>
            )}
            {showSwapTile && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={actionsDisabled}
                onClick={onSwapTile}
              >
                Swap tile
              </button>
            )}
            {challengeCooldownUntil && (
              <p className="station-panel__challenge-cooldown">
                Challenge on cooldown until{" "}
                <time dateTime={challengeCooldownUntil}>
                  {new Date(challengeCooldownUntil).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </p>
            )}
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
