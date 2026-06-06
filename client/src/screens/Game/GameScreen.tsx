import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { Legend } from "../../components/Legend";
import { MapShell } from "../../components/MapShell";
import { StationPanel } from "../../components/StationPanel";
import { captureGeolocation } from "../../hooks/useGeolocation";
import { projectionToNetwork } from "../../lib/projectionMap";
import { useAtStation, useEventLog, useGame, useGameProjection } from "../../state/game/hooks";
import { EventLogDrawer } from "./EventLogDrawer";
import { GameTimer } from "./GameTimer";
import { SwapTileModal } from "./SwapTileModal";
import { VisibilityCountdown } from "./VisibilityCountdown";

export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, joinGame, submitCommand, leaveGame } = useGame();
  const projection = useGameProjection();
  const atStation = useAtStation();
  const eventLog = useEventLog();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (state.status === "absent" || (state.status === "active" && state.id !== id)) {
      void joinGame(id);
    }
  }, [id, joinGame, state.status, state]);

  useEffect(() => {
    if (projection?.status === "ended" && id) {
      navigate(`/games/${id}/summary`, { replace: true });
    }
  }, [projection?.status, id, navigate]);

  const network = useMemo(() => {
    if (!projection) return null;
    return projectionToNetwork(
      projection.mapNodes,
      projection.mapLines,
      projection.mapEdges,
    );
  }, [projection]);

  const activeNodeId = selectedNodeId ?? atStation?.nodeId ?? null;

  const selectedNodeName = useMemo(() => {
    if (!projection || !activeNodeId) return null;
    return projection.mapNodes.find((node) => node.id === activeNodeId)?.name ?? null;
  }, [projection, activeNodeId]);

  const stationLines = useMemo(() => {
    if (!projection || !activeNodeId) return [];
    const node = projection.mapNodes.find((item) => item.id === activeNodeId);
    if (!node) return [];
    return network?.lines.filter((line) => node.lineIds.includes(line.id)) ?? [];
  }, [projection, activeNodeId, network]);

  if (!id) return null;

  if (state.status === "loading" || !projection || !network) {
    return (
      <main className="screen screen--loading">
        <p>Loading game…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="screen">
        <p>{state.error.message}</p>
        <Link to="/lobbies">Back to lobbies</Link>
      </main>
    );
  }

  async function handleCheckIn(nodeId: string) {
    const geo = await captureGeolocation();
    await submitCommand("CHECK_IN", {
      nodeId,
      ...(geo ? { geo } : {}),
    });
    setSelectedNodeId(null);
  }

  async function handleCheckOut() {
    await submitCommand("CHECK_OUT", {});
  }

  async function handleSwap(handTileId: string, stationTileId: string, slotIndex?: number) {
    await submitCommand("SWAP_TILE", {
      handTileId,
      stationTileId,
      ...(slotIndex != null ? { slotIndex } : {}),
    });
    setSwapOpen(false);
  }

  return (
    <div className="app game-screen">
      <header className="app__header game-screen__header">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            leaveGame();
            navigate("/lobbies");
          }}
        >
          End game
        </button>
        <h1 className="app__title">Mingmei&apos;s Mahjong Mania</h1>
        <Legend lines={network.lines} />
        <div className="game-screen__header-end">
          <GameTimer endsAt={projection.endsAt} />
          <VisibilityCountdown nextVisibilityChangeAt={projection.nextVisibilityChangeAt} />
          <button type="button" className="btn btn--secondary" onClick={() => setEventLogOpen(true)}>
            Event log
          </button>
          <ConnectionBadge />
        </div>
      </header>
      <main className="app__map">
        <p className="app__keyboard-hint">
          Tap a station to check in. Use the sidebar for swaps and your hand.
        </p>
        <MapShell
          network={network}
          mapNodes={projection.mapNodes}
          selectedStationId={activeNodeId}
          onSelectStation={setSelectedNodeId}
        />
      </main>
      <StationPanel
        atStation={atStation}
        selectedNodeId={selectedNodeId}
        selectedNodeName={selectedNodeName}
        stationLines={stationLines}
        handTiles={projection.handTiles}
        onClose={() => setSelectedNodeId(null)}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onSwapTile={() => setSwapOpen(true)}
      />
      <EventLogDrawer events={eventLog} open={eventLogOpen} onClose={() => setEventLogOpen(false)} />
      {swapOpen && atStation && (
        <SwapTileModal
          handTiles={projection.handTiles}
          stationTiles={atStation.tiles}
          stationTile={atStation.tile}
          onConfirm={handleSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}
