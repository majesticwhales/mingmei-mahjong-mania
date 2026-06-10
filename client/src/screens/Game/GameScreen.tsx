import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { Legend } from "../../components/Legend";
import { MapShell } from "../../components/MapShell";
import { StationPanel } from "../../components/StationPanel";
import { captureGeolocation } from "../../hooks/useGeolocation";
import { projectionToNetwork } from "../../lib/projectionMap";
import { useIsAdmin } from "../../state/auth/hooks";
import { useAtStation, useEventLog, useGame, useGameProjection } from "../../state/game/hooks";
import { useOutbox } from "../../state/outbox/hooks";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import { EventLogDrawer } from "./EventLogDrawer";
import { GameTimer } from "./GameTimer";
import { SwapTileModal } from "./SwapTileModal";
import { VisibilityCountdown } from "./VisibilityCountdown";

export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, joinGame, resyncGame, submitCommand, leaveGame } = useGame();
  const projection = useGameProjection();
  const atStation = useAtStation();
  const eventLog = useEventLog();
  const { state: outboxState, pushToast } = useOutbox();
  const isAdmin = useIsAdmin();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (state.status === "absent" || (state.status === "active" && state.id !== id)) {
      void joinGame(id);
    }
  }, [id, joinGame, state.status, state]);

  const gameEnded = projection?.status === "ended";

  const handleVisibilityPhaseElapsed = useCallback(() => {
    if (!gameEnded) {
      void resyncGame();
    }
  }, [gameEnded, resyncGame]);

  const network = useMemo(() => {
    if (!projection) return null;
    return projectionToNetwork(
      projection.mapNodes,
      projection.mapLines,
      projection.mapEdges,
    );
  }, [projection]);

  const mapSelectedNodeId = selectedNodeId ?? atStation?.nodeId ?? null;

  const viewingNode = useMemo(() => {
    if (!projection) return null;
    const nodeId = selectedNodeId ?? atStation?.nodeId ?? null;
    if (!nodeId) return null;
    return projection.mapNodes.find((node) => node.id === nodeId) ?? null;
  }, [projection, selectedNodeId, atStation]);

  const checkedInNodeName = useMemo(() => {
    if (!projection || !atStation) return null;
    return projection.mapNodes.find((node) => node.id === atStation.nodeId)?.name ?? atStation.code;
  }, [projection, atStation]);

  const stationLines = useMemo(() => {
    if (!viewingNode || !network) return [];
    return network.lines.filter((line) => viewingNode.lineIds.includes(line.id));
  }, [viewingNode, network]);

  const commandsPending = useMemo(() => {
    if (!id) return false;
    return (outboxState.byGame[id] ?? []).some(
      (row) => row.status === "pending" || row.status === "in_flight",
    );
  }, [id, outboxState.byGame]);

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

  async function runCommand(task: () => Promise<void>) {
    try {
      await task();
    } catch (error) {
      const message =
        error instanceof HttpError ? error.message : "Command failed — try again";
      pushToast(message);
    }
  }

  async function handleCheckIn(nodeId: string) {
    await runCommand(async () => {
      const geo = await captureGeolocation();
      await submitCommand("CHECK_IN", {
        nodeId,
        ...(geo ? { geo } : {}),
      });
      setSelectedNodeId(null);
    });
  }

  async function handleCheckOut() {
    await runCommand(async () => {
      await submitCommand("CHECK_OUT", {});
      setSelectedNodeId(null);
    });
  }

  async function handleSwap(handTileId: string, stationTileId: string, slotIndex?: number) {
    await runCommand(async () => {
      await submitCommand("SWAP_TILE", {
        handTileId,
        stationTileId,
        ...(slotIndex != null ? { slotIndex } : {}),
      });
      setSwapOpen(false);
    });
  }

  async function handleLeave() {
    leaveGame();
    navigate("/lobbies");
  }

  async function handleEndGame() {
    if (!id) return;
    setEnding(true);
    try {
      await restClient.endGame(id);
      leaveGame();
      navigate("/lobbies");
    } catch (error) {
      const message =
        error instanceof HttpError ? error.message : "Could not end game — try again";
      pushToast(message);
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="app game-screen">
      <header className="app__header game-screen__header">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={ending}
          onClick={() => {
            if (gameEnded || !isAdmin) {
              void handleLeave();
              return;
            }
            void handleEndGame();
          }}
        >
          {gameEnded ? "Back to lobbies" : isAdmin ? (ending ? "Ending…" : "End game") : "Leave"}
        </button>
        <h1 className="app__title">Mingmei&apos;s Mahjong Mania</h1>
        <Legend lines={network.lines} />
        <div className="game-screen__header-end">
          <GameTimer endsAt={projection.endsAt} ended={gameEnded} />
          {!gameEnded && (
            <VisibilityCountdown
              visibilityPhase={projection.visibilityPhase}
              visibilityPhaseCount={projection.visibilityPhaseCount}
              nextVisibilityChangeAt={projection.nextVisibilityChangeAt}
              onElapsed={handleVisibilityPhaseElapsed}
            />
          )}
          {gameEnded && id && (
            <Link to={`/games/${id}/summary`} className="btn btn--secondary">
              Summary
            </Link>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => setEventLogOpen(true)}>
            Event log
          </button>
          <ConnectionBadge />
        </div>
      </header>
      <main className="app__map">
        <p className="app__keyboard-hint">
          {gameEnded
            ? "Game over — browse the map or open the summary."
            : "Tap a station to check in. Use the sidebar for swaps and your hand."}
        </p>
        <MapShell
          network={network}
          mapNodes={projection.mapNodes}
          visibilityPhase={projection.visibilityPhase}
          visibilityPhaseCount={projection.visibilityPhaseCount}
          phaseDrivenSlotMap={projection.phaseDrivenSlotMap}
          selectedStationId={mapSelectedNodeId}
          onSelectStation={setSelectedNodeId}
        />
      </main>
      <StationPanel
        atStation={atStation}
        viewingNode={viewingNode}
        checkedInNodeName={checkedInNodeName}
        stationLines={stationLines}
        handTiles={projection.handTiles}
        commandsPending={commandsPending}
        commandsDisabled={gameEnded}
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
