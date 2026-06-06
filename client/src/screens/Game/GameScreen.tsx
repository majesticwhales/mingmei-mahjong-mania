import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { MapShell } from "../../components/MapShell";
import { StationPanel } from "../../components/StationPanel";
import { captureGeolocation } from "../../hooks/useGeolocation";
import { projectionToNetwork } from "../../lib/projectionMap";
import { useAtStation, useEventLog, useGame, useGameProjection } from "../../state/game/hooks";
import { EventLogDrawer } from "./EventLogDrawer";
import { GameTimer } from "./GameTimer";
import { HandPanel } from "./HandPanel";
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

  const selectedNodeName = useMemo(() => {
    if (!projection || !selectedNodeId) return null;
    return projection.mapNodes.find((node) => node.id === selectedNodeId)?.name ?? null;
  }, [projection, selectedNodeId]);

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
        <GameTimer endsAt={projection.endsAt} />
        <ConnectionBadge />
      </header>
      <main className="app__map">
        <MapShell
          network={network}
          mapNodes={projection.mapNodes}
          selectedStationId={selectedNodeId ?? atStation?.nodeId ?? null}
          onSelectStation={setSelectedNodeId}
        />
      </main>
      <StationPanel
        atStation={atStation}
        selectedNodeId={selectedNodeId}
        selectedNodeName={selectedNodeName}
        handTiles={projection.handTiles}
        onClose={() => setSelectedNodeId(null)}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onSwapTile={() => setSwapOpen(true)}
      />
      <section className="game-screen__footer">
        <HandPanel handTiles={projection.handTiles} />
        <VisibilityCountdown nextVisibilityChangeAt={projection.nextVisibilityChangeAt} />
        <button type="button" className="btn btn--secondary btn--block" onClick={() => setEventLogOpen(true)}>
          Event log
        </button>
      </section>
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
