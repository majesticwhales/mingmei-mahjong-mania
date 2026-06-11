import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { Legend } from "../../components/Legend";
import { MapShell } from "../../components/MapShell";
import { StationPanel } from "../../components/StationPanel";
import { projectionToNetwork } from "../../lib/projectionMap";
import { useIsAdmin } from "../../state/auth/hooks";
import {
  useAtStation,
  useClaimWin,
  useCommandWithGeo,
  useEventLog,
  useGame,
  useGameProjection,
  useHandCompleted,
} from "../../state/game/hooks";
import { useOutbox } from "../../state/outbox/hooks";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import { ClaimWinModal } from "./ClaimWinModal";
import { EventLogDrawer } from "./EventLogDrawer";
import { GameTimer } from "./GameTimer";
import { HandCompletedBanner } from "./HandCompletedBanner";
import { SwapTileModal } from "./SwapTileModal";
import { VisibilityCountdown } from "./VisibilityCountdown";

export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, joinGame, resyncGame, leaveGame } = useGame();
  const projection = useGameProjection();
  const atStation = useAtStation();
  const handCompleted = useHandCompleted();
  const claimWin = useClaimWin();
  const eventLog = useEventLog();
  // Phase L: every user-driven command attempts a geo capture before
  // submission. Bind one hook per command type at the component level so
  // the underlying `useCallback` identity stays stable across renders.
  const checkInCommand = useCommandWithGeo("CHECK_IN");
  const checkOutCommand = useCommandWithGeo("CHECK_OUT");
  const swapTileCommand = useCommandWithGeo("SWAP_TILE");
  const { state: outboxState, pushToast } = useOutbox();
  const isAdmin = useIsAdmin();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [lastSeenEventSequence, setLastSeenEventSequence] = useState(0);
  const [trackedGameId, setTrackedGameId] = useState<string | null>(null);
  const [eventLogUnseenBoundary, setEventLogUnseenBoundary] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (state.status === "absent" || (state.status === "active" && state.id !== id)) {
      void joinGame(id);
    }
  }, [id, joinGame, state.status, state]);

  // Only treat the game as ended when the loaded projection belongs to this
  // route. Otherwise a prior session's ended game can still be in context
  // for a frame after navigating to a freshly-started game, which wrongly
  // bounced users to /summary before joinGame finished.
  const gameEnded =
    state.status === "active" && state.id === id && projection?.status === "ended";

  // Phase J — once the game flips to `ended`, send everyone to the
  // summary. The game screen is read-only at this point (the projection
  // already locked every action via `commandsDisabled={gameEnded}`), so
  // there's no in-progress UI to interrupt. The "Back to lobbies" header
  // button still works because the summary screen exposes the same exit.
  useEffect(() => {
    if (gameEnded && id) {
      navigate(`/games/${id}/summary`, { replace: true });
    }
  }, [gameEnded, id, navigate]);

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
    if (panelDismissed && !selectedNodeId) return null;
    const nodeId = selectedNodeId ?? atStation?.nodeId ?? null;
    if (!nodeId) return null;
    return projection.mapNodes.find((node) => node.id === nodeId) ?? null;
  }, [projection, selectedNodeId, atStation, panelDismissed]);

  function handleSelectStation(nodeId: string) {
    setSelectedNodeId(nodeId);
    setPanelDismissed(false);
  }

  function handleClosePanel() {
    setSelectedNodeId(null);
    setPanelDismissed(true);
  }

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

  // Phase J — claim affordance: tenpai AND at least one station tile
  // matches a wait by (suit, rank, copyIndex). We do the match here
  // (rather than inside StationPanel) so the panel stays a pure
  // presentational component, mirroring the swap-tile data-flow.
  const claimWinWaits = useMemo(() => {
    if (!projection || handCompleted) return null;
    const analysis = projection.handAnalysis;
    if (!analysis || analysis.shanten !== 0) return null;
    if (!analysis.waits || analysis.waits.length === 0) return null;
    return analysis.waits;
  }, [projection, handCompleted]);

  const canClaimWin = useMemo(() => {
    if (!claimWinWaits || !atStation) return false;
    const slots = atStation.tiles?.length
      ? atStation.tiles
      : atStation.tile
        ? [{ slotIndex: 0, tile: atStation.tile }]
        : [];
    return slots.some((slot) =>
      claimWinWaits!.some(
        (wait) =>
          wait.tile.suit === slot.tile.suit &&
          wait.tile.rank === slot.tile.rank &&
          wait.tile.copyIndex === slot.tile.copyIndex,
      ),
    );
  }, [claimWinWaits, atStation]);

  const latestEventSequence = useMemo(() => {
    if (eventLog.length === 0) return 0;
    return Math.max(...eventLog.map((event) => event.sequence));
  }, [eventLog]);

  const activeGameId = state.status === "active" ? state.id : null;

  if (activeGameId !== trackedGameId) {
    setTrackedGameId(activeGameId);
    setLastSeenEventSequence(activeGameId == null ? 0 : latestEventSequence);
  }

  const hasUnseenEvents =
    !eventLogOpen && latestEventSequence > lastSeenEventSequence;

  function handleOpenEventLog() {
    setEventLogUnseenBoundary(lastSeenEventSequence);
    setLastSeenEventSequence(latestEventSequence);
    setEventLogOpen(true);
  }

  function handleCloseEventLog() {
    setLastSeenEventSequence(latestEventSequence);
    setEventLogOpen(false);
    setEventLogUnseenBoundary(null);
  }

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
    setCheckInPending(true);
    try {
      await runCommand(async () => {
        // Phase L: `checkInCommand` internally captures geo (2 s timeout,
        // cached fix preferred) and attaches it under `payload.geo`. The
        // capture never throws — a null result just means the command
        // ships without a sample.
        await checkInCommand({ nodeId });
        setSelectedNodeId(null);
        setPanelDismissed(false);
      });
    } finally {
      setCheckInPending(false);
    }
  }

  async function handleCheckOut() {
    await runCommand(async () => {
      await checkOutCommand({});
      setSelectedNodeId(null);
    });
  }

  async function handleSwap(handTileId: string, stationTileId: string, slotIndex?: number) {
    await runCommand(async () => {
      await swapTileCommand({
        handTileId,
        stationTileId,
        ...(slotIndex != null ? { slotIndex } : {}),
      });
      setSwapOpen(false);
    });
  }

  async function handleClaimWin(stationTileId: string) {
    setClaimPending(true);
    try {
      await runCommand(async () => {
        await claimWin(stationTileId);
        setClaimOpen(false);
      });
    } finally {
      setClaimPending(false);
    }
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
          <button
            type="button"
            className="btn btn--secondary game-screen__event-log-btn"
            onClick={handleOpenEventLog}
          >
            Event log
            {hasUnseenEvents && (
              <span className="game-screen__event-log-badge" aria-label="New events" />
            )}
          </button>
          <ConnectionBadge />
        </div>
      </header>
      <main className="app__map">
        <MapShell
          network={network}
          mapNodes={projection.mapNodes}
          visibilityPhase={projection.visibilityPhase}
          visibilityPhaseCount={projection.visibilityPhaseCount}
          phaseDrivenSlotMap={projection.phaseDrivenSlotMap}
          selectedStationId={mapSelectedNodeId}
          onSelectStation={handleSelectStation}
          onMapBackgroundClick={viewingNode ? handleClosePanel : undefined}
        />
      </main>
      {handCompleted && (
        <HandCompletedBanner
          handCompleted={handCompleted}
          teamsCompletedCount={projection.teamsCompleted.length}
        />
      )}
      <StationPanel
        atStation={atStation}
        viewingNode={viewingNode}
        checkedInNodeName={checkedInNodeName}
        stationLines={stationLines}
        handTiles={projection.handTiles}
        commandsPending={commandsPending}
        checkInPending={checkInPending}
        commandsDisabled={gameEnded || Boolean(handCompleted)}
        canClaimWin={canClaimWin}
        onClose={handleClosePanel}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        onSwapTile={() => setSwapOpen(true)}
        onClaimWin={() => setClaimOpen(true)}
      />
      <EventLogDrawer
        events={eventLog}
        open={eventLogOpen}
        onClose={handleCloseEventLog}
        unseenBoundarySequence={eventLogUnseenBoundary}
      />
      {swapOpen && atStation && (
        <SwapTileModal
          handTiles={projection.handTiles}
          stationTiles={atStation.tiles}
          stationTile={atStation.tile}
          onConfirm={handleSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}
      {claimOpen && atStation && claimWinWaits && (
        <ClaimWinModal
          atStation={atStation}
          waits={claimWinWaits}
          onConfirm={handleClaimWin}
          onClose={() => setClaimOpen(false)}
          pending={claimPending}
        />
      )}
    </div>
  );
}
