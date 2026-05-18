import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { Legend } from "./components/Legend";
import { MapShell } from "./components/MapShell";
import { StationPanel } from "./components/StationPanel";
import { shuffleRiichiTileWall } from "./data/riichiTiles";
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

      const nextStation = network.stations
        .filter((station) => station.id !== currentStation.id)
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
    [network, selectedStation],
  );

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
        <h1 className="app__title">Toronto TTC 2026</h1>
        <Legend lines={network.lines} />
      </header>

      <main className="app__map">
        <p className="app__keyboard-hint">
          Use arrow keys to move between stations. Press Escape to clear.
        </p>
        <MapShell
          network={network}
          selectedStationId={selectedStationId}
          tileWall={tileWall}
          onSelectStation={setSelectedStationId}
        />
      </main>

      <StationPanel
        network={network}
        station={selectedStation}
        tileWall={tileWall}
        onShuffleTiles={() => setTileWall(shuffleRiichiTileWall())}
        onClose={() => setSelectedStationId(null)}
      />
    </div>
  );
}
