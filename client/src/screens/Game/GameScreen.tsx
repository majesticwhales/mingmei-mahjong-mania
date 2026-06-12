import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MapShell } from "../../components/MapShell";
import { StationPanel } from "../../components/StationPanel";
import { resolveCheckedInChallenge } from "../../lib/challengeContext";
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
import { ChallengeModal } from "./ChallengeModal";
import { ClaimWinModal } from "./ClaimWinModal";
import { ExitGameConfirmModal } from "./ExitGameConfirmModal";
import { EventLogDrawer } from "./EventLogDrawer";
import { GameHeaderTiles } from "./GameHeaderTiles";
import { GameTimer } from "./GameTimer";
import { HandCompletedModal } from "./HandCompletedModal";
import { HandPanel } from "./HandPanel";
import { SwapTileModal } from "./SwapTileModal";
import { VisibilityCountdown } from "./VisibilityCountdown";

export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewingEndedMap = searchParams.get("view") === "map";
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
  const startChallengeCommand = useCommandWithGeo("START_CHALLENGE");
  const completeChallengeCommand = useCommandWithGeo("CHALLENGE_COMPLETED");
  const forfeitChallengeCommand = useCommandWithGeo("CHALLENGE_FORFEITED");
  const { state: outboxState, pushToast } = useOutbox();
  const isAdmin = useIsAdmin();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [handPanelOpen, setHandPanelOpen] = useState(false);
  const [eventLogOpen, setEventLogOpen] = useState(false);
  const [lastSeenEventSequence, setLastSeenEventSequence] = useState(0);
  const [trackedGameId, setTrackedGameId] = useState<string | null>(null);
  const [eventLogUnseenBoundary, setEventLogUnseenBoundary] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengePending, setChallengePending] = useState(false);
  const startedChallengeRef = useRef<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [handCompletedDismissed, setHandCompletedDismissed] = useState(false);
  const [trackedHandCompletedAt, setTrackedHandCompletedAt] = useState<string | null>(
    null,
  );
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);
  const [pendingCheckInNodeId, setPendingCheckInNodeId] = useState<string | null>(null);

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
    state.status === "active" &&
    state.id === id &&
    projection?.gameId === id &&
    projection.status === "ended";

  // Phase J — once the game flips to `ended`, send everyone to the
  // summary. The game screen is read-only at this point (the projection
  // already locked every action via `commandsDisabled={gameEnded}`), so
  // there's no in-progress UI to interrupt. The "Back to lobbies" header
  // button still works because the summary screen exposes the same exit.
  useEffect(() => {
    if (gameEnded && id && !viewingEndedMap) {
      navigate(`/games/${id}/summary`, { replace: true });
    }
  }, [gameEnded, id, navigate, viewingEndedMap]);

  // Auto-open the hand-completed modal when a new win snapshot arrives.
  // Adjust state during render (not in an effect) so eslint's
  // react-hooks/set-state-in-effect rule stays satisfied. Coalesce
  // missing completedAt to null — `undefined !== null` would loop forever.
  const handCompletedAt = handCompleted?.completedAt ?? null;
  if (handCompletedAt !== trackedHandCompletedAt) {
    setTrackedHandCompletedAt(handCompletedAt);
    if (handCompletedAt != null) {
      setHandCompletedDismissed(false);
    }
  }
  const handCompletedOpen = Boolean(handCompleted) && !handCompletedDismissed;

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

  const stationNamesByCode = useMemo(() => {
    if (!projection) return undefined;
    return Object.fromEntries(projection.mapNodes.map((node) => [node.code, node.name]));
  }, [projection]);

  const isCheckInSynced = Boolean(
    pendingCheckInNodeId && atStation?.nodeId === pendingCheckInNodeId,
  );
  // Drop the optimistic check-in target once the projection catches up.
  // Adjust state during render (not in an effect) so eslint's
  // react-hooks/set-state-in-effect rule stays satisfied. Without this, a
  // stale `pendingCheckInNodeId` survives checkout and locks every station.
  if (isCheckInSynced) {
    setPendingCheckInNodeId(null);
  }
  const navigatingToNodeId = isCheckInSynced ? null : pendingCheckInNodeId;
  const panelSelectedNodeId = isCheckInSynced ? null : selectedNodeId;

  const mapSelectedNodeId =
    panelSelectedNodeId ?? navigatingToNodeId ?? atStation?.nodeId ?? null;

  const viewingNode = useMemo(() => {
    if (!projection) return null;
    if (panelDismissed && !panelSelectedNodeId && !navigatingToNodeId) return null;
    const nodeId = mapSelectedNodeId;
    if (!nodeId) return null;
    return projection.mapNodes.find((node) => node.id === nodeId) ?? null;
  }, [projection, mapSelectedNodeId, panelDismissed, panelSelectedNodeId, navigatingToNodeId]);

  const isSyncingCheckIn = Boolean(
    navigatingToNodeId && atStation?.nodeId !== navigatingToNodeId,
  );

  function handleSelectStation(nodeId: string) {
    setSelectedNodeId(nodeId);
    setPanelDismissed(false);
    setHandPanelOpen(false);
  }

  function handleClosePanel() {
    setSelectedNodeId(null);
    setPanelDismissed(true);
  }

  function handleOpenHandPanel() {
    setHandPanelOpen(true);
    setSelectedNodeId(null);
    setPanelDismissed(true);
  }

  function handleCloseHandPanel() {
    setHandPanelOpen(false);
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

  // Phase J — `claimWinWaits` still lives here because the
  // `<ClaimWinModal />` needs the full wait list (the StationPanel
  // itself derives the simpler "is the button enabled" bit from
  // `nodeView.availableActions[].claim_win` directly).
  const claimWinWaits = useMemo(() => {
    if (!projection || handCompleted) return null;
    const analysis = projection.handAnalysis;
    if (!analysis || analysis.shanten !== 0) return null;
    if (!analysis.waits || analysis.waits.length === 0) return null;
    return analysis.waits;
  }, [projection, handCompleted]);

  const activeChallenge = useMemo(
    () => resolveCheckedInChallenge(atStation),
    [atStation],
  );

  const runCommand = useCallback(async (task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      const message =
        error instanceof HttpError ? error.message : "Command failed — try again";
      pushToast(message);
    }
  }, [pushToast]);

  // Close the challenge modal + clear the auto-start guard whenever the
  // team's checked-in node changes (incl. checking out → null). The
  // React-19 `react-hooks/set-state-in-effect` rule rejects an effect
  // that unconditionally calls `setState`, so the modal-close lives in
  // an "adjust state during render" block keyed off a tracked node id.
  // The ref reset is the canonical effect-side companion (refs can't be
  // mutated during render under `react-hooks/refs`).
  const currentCheckedInNodeId = atStation?.nodeId ?? null;
  const [trackedChallengeNodeId, setTrackedChallengeNodeId] = useState<string | null>(
    currentCheckedInNodeId,
  );
  if (trackedChallengeNodeId !== currentCheckedInNodeId) {
    setTrackedChallengeNodeId(currentCheckedInNodeId);
    setChallengeOpen(false);
  }
  useEffect(() => {
    startedChallengeRef.current = null;
  }, [atStation?.nodeId]);

  useEffect(() => {
    const challenge = atStation?.currentChallenge;
    if (!challengeOpen || !challenge || !atStation) return;
    if (challenge.status !== "available") return;

    const key = `${atStation.nodeId}:${challenge.challengeId}`;
    if (startedChallengeRef.current === key) return;
    startedChallengeRef.current = key;

    void runCommand(async () => {
      await startChallengeCommand({ nodeId: atStation.nodeId });
    });
  }, [challengeOpen, atStation, runCommand, startChallengeCommand]);

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

  if (state.status === "error" && state.id === id) {
    return (
      <main className="screen">
        <p>{state.error.message}</p>
        <Link to="/lobbies">Back to lobbies</Link>
      </main>
    );
  }

  if (state.status === "loading" || !projection || !network) {
    return (
      <main className="screen screen--loading">
        <p>Loading game…</p>
      </main>
    );
  }

  async function handleCheckIn(nodeId: string) {
    setCheckInPending(true);
    setPendingCheckInNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setPanelDismissed(false);
    let succeeded = false;
    try {
      await runCommand(async () => {
        // Phase L: `checkInCommand` internally captures geo (2 s timeout,
        // cached fix preferred) and attaches it under `payload.geo`. The
        // capture never throws — a null result just means the command
        // ships without a sample.
        await checkInCommand({ nodeId });
        succeeded = true;
      });
    } finally {
      setCheckInPending(false);
      if (!succeeded) {
        setPendingCheckInNodeId(null);
      }
    }
  }

  async function handleCompleteChallenge() {
    const instanceId = atStation?.currentChallenge?.instanceId;
    if (!instanceId) return;

    setChallengePending(true);
    try {
      await runCommand(async () => {
        await completeChallengeCommand({ instanceId });
        setChallengeOpen(false);
        setSwapOpen(true);
      });
    } finally {
      setChallengePending(false);
    }
  }

  async function handleAbandonChallenge() {
    const instanceId = atStation?.currentChallenge?.instanceId;
    if (!instanceId) {
      setChallengeOpen(false);
      return;
    }

    setChallengePending(true);
    try {
      await runCommand(async () => {
        await forfeitChallengeCommand({ instanceId });
        setChallengeOpen(false);
      });
    } finally {
      setChallengePending(false);
    }
  }

  async function handleCheckOut() {
    await runCommand(async () => {
      await checkOutCommand({});
      setSelectedNodeId(null);
      setPendingCheckInNodeId(null);
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
    setLeaving(true);
    try {
      leaveGame();
      navigate("/lobbies");
    } finally {
      setLeaving(false);
    }
  }

  async function handleEndGame() {
    if (!id) return;
    setEnding(true);
    try {
      await restClient.endGame(id);
      navigate(`/games/${id}/summary`, { replace: true });
    } catch (error) {
      const message =
        error instanceof HttpError ? error.message : "Could not end game — try again";
      pushToast(message);
    } finally {
      setEnding(false);
    }
  }

  function handleExitClick() {
    if (gameEnded) {
      void handleLeave();
      return;
    }
    setExitConfirmOpen(true);
  }

  function handleCloseExitConfirm() {
    if (ending || leaving) return;
    setExitConfirmOpen(false);
  }

  async function handleConfirmExit() {
    if (isAdmin) {
      await handleEndGame();
      return;
    }
    await handleLeave();
  }

  const exitPending = ending || leaving;
  const exitConfirmVariant = isAdmin ? "end_game" : "leave";

  const panelOpen = handPanelOpen || viewingNode != null;

  return (
    <div className={`app game-screen${panelOpen ? " game-screen--panel-open" : ""}`}>
      <header className="app__header game-screen__header">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleOpenHandPanel}
        >
          View hand
        </button>
        <h1 className="app__title">Mingmei&apos;s Mahjong Mania</h1>
        <div className="game-screen__header-end">
          <GameTimer endsAt={projection.endsAt} ended={gameEnded} />
          {!gameEnded && (
            <VisibilityCountdown
              nextVisibilityChangeAt={projection.nextVisibilityChangeAt}
              onElapsed={handleVisibilityPhaseElapsed}
            />
          )}
          {gameEnded && id && (
            <Link to={`/games/${id}/summary`} className="btn btn--secondary">
              Summary
            </Link>
          )}
          {handCompleted && !handCompletedOpen && (
            <button
              type="button"
              className="btn btn--secondary game-screen__win-summary-btn"
              onClick={() => setHandCompletedDismissed(false)}
            >
              Your win
            </button>
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
        </div>
      </header>
      <main className="app__map">
        <aside className="game-wind-bubble" aria-label="Round, seat, and dora">
          <GameHeaderTiles
            seatWind={projection.seatWind}
            roundWind={projection.roundWind}
            doraIndicator={projection.doraIndicator}
          />
        </aside>
        <MapShell
          network={network}
          mapNodes={projection.mapNodes}
          selectedStationId={mapSelectedNodeId}
          onSelectStation={handleSelectStation}
          onMapBackgroundClick={
            viewingNode ? handleClosePanel : handPanelOpen ? handleCloseHandPanel : undefined
          }
        />
        <button
          type="button"
          className="btn btn--ghost game-screen__exit-btn"
          disabled={exitPending}
          onClick={handleExitClick}
        >
          {gameEnded ? "Back to lobbies" : isAdmin ? (ending ? "Ending…" : "End game") : "Leave"}
        </button>
      </main>
      {exitConfirmOpen && (
        <ExitGameConfirmModal
          variant={exitConfirmVariant}
          pending={exitPending}
          onConfirm={() => void handleConfirmExit()}
          onClose={handleCloseExitConfirm}
        />
      )}
      {handCompleted && handCompletedOpen && (
        <HandCompletedModal
          handCompleted={handCompleted}
          teamsCompletedCount={projection.teamsCompleted.length}
          onClose={() => setHandCompletedDismissed(true)}
        />
      )}
      {handPanelOpen && (
        <HandPanel
          handTiles={projection.handTiles}
          open={handPanelOpen}
          onClose={handleCloseHandPanel}
        />
      )}
      {viewingNode && (
        <StationPanel
          viewingNodeId={viewingNode.id}
          checkedInNodeName={checkedInNodeName}
          stationLines={stationLines}
          handTiles={projection.handTiles}
          commandsPending={commandsPending}
          checkInPending={checkInPending || isSyncingCheckIn}
          commandsDisabled={gameEnded || Boolean(handCompleted)}
          onClose={handleClosePanel}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onSwapTile={() => setSwapOpen(true)}
          onOpenChallenge={() => setChallengeOpen(true)}
          onClaimWin={() => setClaimOpen(true)}
        />
      )}
      <EventLogDrawer
        events={eventLog}
        stationNamesByCode={stationNamesByCode}
        open={eventLogOpen}
        onClose={handleCloseEventLog}
        unseenBoundarySequence={eventLogUnseenBoundary}
      />
      {challengeOpen && activeChallenge && (
        <ChallengeModal
          title={activeChallenge.title}
          description={activeChallenge.description}
          flavorText={activeChallenge.flavorText}
          imageUrl={activeChallenge.imageUrl}
          pending={challengePending}
          completeDisabled={
            activeChallenge.status !== "in_progress" || !activeChallenge.instanceId
          }
          onComplete={() => void handleCompleteChallenge()}
          onAbandon={() => void handleAbandonChallenge()}
          onClose={() => setChallengeOpen(false)}
        />
      )}
      {swapOpen && atStation && (
        <SwapTileModal
          handTiles={projection.handTiles}
          stationTiles={atStation.tiles}
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
