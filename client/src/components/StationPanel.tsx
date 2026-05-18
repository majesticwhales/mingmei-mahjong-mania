import { useMemo, useState } from "react";
import {
  getRemainingTileGroups,
  getStationTile,
  sortRiichiTiles,
  TILE_BACK_IMAGE_PATH,
  type RiichiTileCopy,
} from "../data/riichiTiles";
import {
  getPlayerIndex,
  isAdminView,
  isStationVisibleToView,
  type PlayerViewMode,
} from "../data/playerViews";
import type { Network, Station } from "../data/types";

interface Props {
  network: Network;
  station: Station | null;
  tileWall: readonly RiichiTileCopy[];
  viewMode: PlayerViewMode;
  onShuffleTiles: () => void;
  onClose: () => void;
}

export function StationPanel({
  network,
  station,
  tileWall,
  viewMode,
  onShuffleTiles,
  onClose,
}: Props) {
  const [showRemainingTiles, setShowRemainingTiles] = useState(false);
  const isOpen = Boolean(station) || showRemainingTiles;
  const isAdmin = isAdminView(viewMode);
  const playerIndex = getPlayerIndex(viewMode);
  const linesById = new Map(network.lines.map((l) => [l.id, l]));
  const stationIndex = station
    ? network.stations.findIndex((item) => item.id === station.id)
    : -1;
  const isStationTileVisible =
    stationIndex >= 0 && isStationVisibleToView(stationIndex, viewMode);
  const stationTile = useMemo(
    () => (station ? getStationTile(network.stations, station.id, tileWall) : null),
    [network.stations, station, tileWall],
  );
  const remainingTileGroups = useMemo(
    () => getRemainingTileGroups(network.stations.length, tileWall),
    [network.stations.length, tileWall],
  );
  const visibleTileGroups =
    playerIndex == null
      ? remainingTileGroups
      : remainingTileGroups[playerIndex]
        ? [remainingTileGroups[playerIndex]]
        : [];
  const hasRemainingTiles = visibleTileGroups.some((group) => group.length > 0);
  const canRevealStationTile = isAdmin || isStationTileVisible;
  const assignedTileImagePath = canRevealStationTile
    ? stationTile?.imagePath
    : TILE_BACK_IMAGE_PATH;
  const assignedTileName = canRevealStationTile ? stationTile?.label : "Hidden tile";
  const assignedTileCopy = canRevealStationTile ? stationTile?.copy : null;

  const handleClose = () => {
    setShowRemainingTiles(false);
    onClose();
  };

  return (
    <aside
      className={`station-panel${isOpen ? " station-panel--open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Station details"
    >
      <div className="station-panel__handle" aria-hidden="true" />

      <header className="station-panel__header">
        <div>
          <p className="station-panel__eyebrow">Station</p>
          <h2 className="station-panel__title">
            {station ? station.name : "Pick a station"}
          </h2>
        </div>
        {(station || showRemainingTiles) && (
          <button
            type="button"
            className="station-panel__close"
            aria-label="Close station details"
            onClick={handleClose}
          >
            ×
          </button>
        )}
      </header>

      {!station && (
        <div className="station-panel__body">
          <p className="station-panel__empty">
            Tap any station on the map to see its assigned Riichi tile. Player
            views only reveal their own station tiles and hand.
          </p>
          {hasRemainingTiles && (
            <div className="station-panel__actions">
              <button
                type="button"
                className="station-panel__tile-toggle"
                onClick={() => setShowRemainingTiles((current) => !current)}
              >
                {showRemainingTiles
                  ? playerIndex == null
                    ? "Hide remaining hands"
                    : "Hide your hand"
                  : playerIndex == null
                    ? "Show remaining hands"
                    : "Show your hand"}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="station-panel__tile-toggle station-panel__tile-toggle--secondary"
                  onClick={onShuffleTiles}
                >
                  Randomize tiles
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {station && (
        <div className="station-panel__body">
          {stationTile && assignedTileImagePath && assignedTileName && (
            <section>
              <h3 className="station-panel__section-title">Assigned tile</h3>
              <div
                className={`station-panel__assigned-tile${
                  canRevealStationTile ? "" : " station-panel__assigned-tile--hidden"
                }`}
              >
                <img
                  src={assignedTileImagePath}
                  alt={assignedTileName}
                  className="station-panel__tile-image station-panel__tile-image--large"
                />
                <div>
                  <p className="station-panel__tile-name">{assignedTileName}</p>
                  <p className="station-panel__tile-copy">
                    {assignedTileCopy == null
                      ? "This tile is hidden in this player view."
                      : `Copy ${assignedTileCopy} of 4`}
                  </p>
                </div>
              </div>
            </section>
          )}

          <section>
            <h3 className="station-panel__section-title">Served by</h3>
            <ul className="station-panel__lines">
              {station.lineIds
                .map((id) => linesById.get(id))
                .filter((l): l is NonNullable<typeof l> => Boolean(l))
                .map((line) => (
                  <li key={line.id} className="station-panel__line">
                    <span
                      className="station-panel__swatch"
                      style={{ background: line.color }}
                      aria-hidden="true"
                    />
                    <span>{line.name}</span>
                  </li>
                ))}
            </ul>
          </section>

          {hasRemainingTiles && (
            <div className="station-panel__actions">
              <button
                type="button"
                className="station-panel__tile-toggle"
                onClick={() => setShowRemainingTiles((current) => !current)}
              >
                {showRemainingTiles
                  ? playerIndex == null
                    ? "Hide remaining hands"
                    : "Hide your hand"
                  : playerIndex == null
                    ? "Show remaining hands"
                    : "Show your hand"}
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="station-panel__tile-toggle station-panel__tile-toggle--secondary"
                  onClick={onShuffleTiles}
                >
                  Randomize tiles
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showRemainingTiles && (
        <section className="station-panel__remaining" aria-label="Remaining tiles">
          <h3 className="station-panel__section-title">
            {playerIndex == null ? "Remaining 52 tiles: 4 hands of 13" : "Your hand"}
          </h3>
          <div className="station-panel__hands">
            {visibleTileGroups.map((group, groupIndex) => (
              <div className="station-panel__hand" key={playerIndex ?? groupIndex}>
                <h4 className="station-panel__hand-title">
                  {playerIndex == null ? `Hand ${groupIndex + 1}` : `Player ${playerIndex + 1}`}
                </h4>
                <ul className="station-panel__tile-grid">
                  {sortRiichiTiles(group).map((tile) => (
                    <li className="station-panel__tile" key={tile.copyId}>
                      <img
                        src={tile.imagePath}
                        alt={tile.label}
                        title={`${tile.label} (copy ${tile.copy})`}
                        className="station-panel__tile-image"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
