import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { Legend } from "./components/Legend";
import { MapShell } from "./components/MapShell";
import { StationPanel } from "./components/StationPanel";
import {
  PLAYER_VIEW_OPTIONS,
  type PlayerViewMode,
} from "./data/playerViews";
import { getRandomDoraTile, shuffleRiichiTileWall } from "./data/riichiTiles";
import type { Network } from "./data/types";
import { getNetwork } from "./services/network";

const ARROW_KEYS = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"] as const;
type ArrowKey = (typeof ARROW_KEYS)[number];

function isArrowKey(key: string): key is ArrowKey {
  return ARROW_KEYS.includes(key as ArrowKey);
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export default function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [tileWall, setTileWall] = useState(shuffleRiichiTileWall);
  const [doraTile, setDoraTile] = useState(getRandomDoraTile);
  const [viewMode, setViewMode] = useState<PlayerViewMode>("admin");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNetwork()
      .then((data) => {
        if (!cancelled) setNetwork(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the network. Please retry.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStation = useMemo(() => {
    if (!network || !selectedStationId) return null;
    return network.stations.find((s) => s.id === selectedStationId) ?? null;
  }, [network, selectedStationId]);

  const stationsById = useMemo(() => {
    if (!network) return new Map<string, Network["stations"][number]>();
    return new Map(network.stations.map((station) => [station.id, station]));
  }, [network]);

  const connectedStationIdsByStationId = useMemo(() => {
    const connectedStations = new Map<string, Set<string>>();
    if (!network) return connectedStations;

    for (const line of network.lines) {
      for (let index = 0; index < line.stationIds.length - 1; index += 1) {
        const stationId = line.stationIds[index];
        const nextStationId = line.stationIds[index + 1];

        if (!connectedStations.has(stationId)) {
          connectedStations.set(stationId, new Set());
        }
        if (!connectedStations.has(nextStationId)) {
          connectedStations.set(nextStationId, new Set());
        }

        connectedStations.get(stationId)?.add(nextStationId);
        connectedStations.get(nextStationId)?.add(stationId);
      }
    }

    return connectedStations;
  }, [network]);

  const selectStationByDirection = useCallback(
    (key: ArrowKey) => {
      if (!network) return;

      const currentStation =
        selectedStation ??
        network.stations[Math.floor((network.stations.length - 1) / 2)];
      if (!currentStation) return;

      const direction =
        key === "ArrowRight"
          ? { x: 1, y: 0 }
          : key === "ArrowLeft"
            ? { x: -1, y: 0 }
            : key === "ArrowDown"
              ? { x: 0, y: 1 }
              : { x: 0, y: -1 };

      const connectedStationIds =
        connectedStationIdsByStationId.get(currentStation.id) ?? new Set<string>();

      const nextStation = Array.from(connectedStationIds)
        .map((stationId) => stationsById.get(stationId))
        .filter((station): station is Network["stations"][number] => Boolean(station))
        .map((station) => {
          const dx = station.x - currentStation.x;
          const dy = station.y - currentStation.y;
          const directionalDistance = dx * direction.x + dy * direction.y;
          const crossAxisDistance = Math.abs(dx * direction.y - dy * direction.x);
          return { station, directionalDistance, crossAxisDistance };
        })
        .filter(({ directionalDistance }) => directionalDistance > 0)
        .sort(
          (a, b) =>
            a.crossAxisDistance - b.crossAxisDistance ||
            a.directionalDistance - b.directionalDistance,
        )[0]?.station;

      if (nextStation) {
        setSelectedStationId(nextStation.id);
      }
    },
    [connectedStationIdsByStationId, network, selectedStation, stationsById],
  );

  const randomizeTiles = useCallback(() => {
    setTileWall(shuffleRiichiTileWall());
    setDoraTile(getRandomDoraTile());
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) return;

      if (isArrowKey(event.key)) {
        event.preventDefault();
        selectStationByDirection(event.key);
      } else if (event.key === "Home" && network?.stations[0]) {
        event.preventDefault();
        setSelectedStationId(network.stations[0].id);
      } else if (event.key === "End" && network?.stations.length) {
        event.preventDefault();
        setSelectedStationId(network.stations[network.stations.length - 1].id);
      } else if (event.key === "Escape") {
        setSelectedStationId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [network, selectStationByDirection]);

  if (error) {
    return (
      <main className="app app--error">
        <p>{error}</p>
      </main>
    );
  }

  if (!network) {
    return (
      <main className="app app--loading">
        <p>Loading network…</p>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Mingmei's Mahjong Mania</h1>
        <Legend lines={network.lines} />
        <label className="app__view-selector">
          <span>View</span>
          <select
            value={viewMode}
            onChange={(event) => setViewMode(event.target.value as PlayerViewMode)}
          >
            {PLAYER_VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="app__map">
        <aside className="app__dora" aria-label={`Dora tile: ${doraTile.label}`}>
          <span className="app__dora-label">Dora</span>
          <img
            src={doraTile.imagePath}
            alt={doraTile.label}
            title={doraTile.label}
            className="app__dora-tile"
          />
          <span className="app__dora-name">{doraTile.label}</span>
        </aside>
        <p className="app__keyboard-hint">
          Use arrow keys to move between stations. Press Escape to clear.
        </p>
        <MapShell
          network={network}
          selectedStationId={selectedStationId}
          tileWall={tileWall}
          viewMode={viewMode}
          onSelectStation={setSelectedStationId}
        />
      </main>

      <StationPanel
        network={network}
        station={selectedStation}
        tileWall={tileWall}
        viewMode={viewMode}
        onShuffleTiles={randomizeTiles}
        onClose={() => setSelectedStationId(null)}
      />
    </div>
  );
}
