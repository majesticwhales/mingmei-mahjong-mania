import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { Legend } from "./components/Legend";
import { MapShell } from "./components/MapShell";
import { StationPanel } from "./components/StationPanel";
import type { Network } from "./data/types";
import { getNetwork } from "./services/network";

export default function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
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
        <MapShell
          network={network}
          selectedStationId={selectedStationId}
          onSelectStation={setSelectedStationId}
        />
      </main>

      <StationPanel
        network={network}
        station={selectedStation}
        onClose={() => setSelectedStationId(null)}
      />
    </div>
  );
}
