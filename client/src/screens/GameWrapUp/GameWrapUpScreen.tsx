import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLockDocumentScroll } from "../../hooks/useLockDocumentScroll";
import { useTimerExpired } from "../../hooks/useTimerExpired";
import { useIsAdmin } from "../../state/auth/hooks";
import { useGame, useGameProjection } from "../../state/game/hooks";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import type { GameEndReason } from "../../wire/projection";

const GATHERING_STATION_CODE = "bay";

function resolveGatheringStationName(
  mapNodes: ReadonlyArray<{ code: string; name: string }> | undefined,
): string {
  const station = mapNodes?.find((node) => node.code === GATHERING_STATION_CODE);
  return station?.name ?? "Bay Station";
}

/**
 * Reason-specific wrap-up headline. The projection's `endReason` is
 * only populated once the `GAME_ENDED` event has been written; when
 * the client lands on the wrap-up screen because the local timer hit
 * zero before the server's `GAME_END` job ran (`endReason == null`)
 * we fall back to the timer copy — the scheduler will overwrite the
 * projection with the canonical reason as soon as the event hits the
 * socket, and the typical case for that race is the timer firing.
 */
function endReasonHeadline(reason: GameEndReason | null): string {
  switch (reason) {
    case "all_teams_completed":
      return "Every team has completed their hand.";
    case "manual":
      return "The host ended the game early.";
    case "timer":
    case null:
    default:
      return "Time's up.";
  }
}

export function GameWrapUpScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, joinGame } = useGame();
  const projection = useGameProjection();
  const isAdmin = useIsAdmin();
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  useLockDocumentScroll();

  useEffect(() => {
    if (!id) return;
    if (state.status === "absent" || (state.status === "active" && state.id !== id)) {
      void joinGame(id);
    }
  }, [id, joinGame, state.status, state]);

  const gameReady =
    state.status === "active" &&
    state.id === id &&
    projection?.gameId === id;

  const scoresRevealed = gameReady && projection.status === "ended";
  const timerExpired = useTimerExpired(
    gameReady ? projection.endsAt : null,
    gameReady && projection.status === "active",
  );
  const wrapUpActive =
    gameReady && (projection.status === "ending" || timerExpired);

  useEffect(() => {
    if (!id || !scoresRevealed) return;
    navigate(`/games/${id}/summary`, { replace: true });
  }, [scoresRevealed, id, navigate]);

  useEffect(() => {
    if (!id || !gameReady || wrapUpActive) return;
    if (projection.status === "active" && !timerExpired) {
      navigate(`/games/${id}`, { replace: true });
    }
  }, [gameReady, id, navigate, projection, wrapUpActive, timerExpired]);

  const gatheringStationName = useMemo(
    () => resolveGatheringStationName(projection?.mapNodes),
    [projection?.mapNodes],
  );

  // Wrap-up can mount before the server has emitted `GAME_ENDED` (when
  // the client timer hits zero a tick ahead of the scheduler job), so
  // `endReason` may still be `null` here. We resolve the headline from
  // whatever value the projection currently holds and re-evaluate on
  // every push; once the event lands the headline upgrades from the
  // timer default to the canonical reason ("Every team has completed
  // their hand." / "The host ended the game early.").
  const reasonHeadline = useMemo(
    () => endReasonHeadline(projection?.endReason ?? null),
    [projection?.endReason],
  );

  async function handleRevealScores() {
    if (!id) return;
    setRevealing(true);
    setRevealError(null);
    try {
      await restClient.revealScores(id);
    } catch (error) {
      const message =
        error instanceof HttpError ? error.message : "Could not reveal scores — try again";
      setRevealError(message);
    } finally {
      setRevealing(false);
    }
  }

  if (!id) return null;

  if (state.status === "error" && state.id === id) {
    return (
      <main className="screen screen--dark">
        <p>{state.error.message}</p>
        <Link to="/lobbies">Back to lobbies</Link>
      </main>
    );
  }

  if (state.status === "loading" || !projection || !gameReady) {
    return (
      <main className="screen screen--loading screen--dark">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="screen screen--dark game-wrap-up">
      <header className="game-wrap-up__header">
        <p className="game-wrap-up__eyebrow">Game over</p>
        <h1 className="game-wrap-up__title">Return to {gatheringStationName} Station</h1>
      </header>

      <p className="game-wrap-up__message">
        <p>{reasonHeadline}</p>{" "}
        Head back to <strong>{gatheringStationName} Station</strong> so everyone can
        regroup before scores are revealed.
      </p>

      <img
        src="/challenges/bay-wrap-up.png"
        alt={`Meet at ${gatheringStationName}`}
        className="game-wrap-up__image"
      />

      {isAdmin ? (
        <section className="game-wrap-up__host">
          <p className="game-wrap-up__host-copy">
            When your group is ready, reveal the final scores for all teams.
          </p>
          {revealError && <p className="form__error">{revealError}</p>}
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={revealing}
            onClick={() => void handleRevealScores()}
          >
            {revealing ? "Revealing…" : "Reveal scores"}
          </button>
        </section>
      ) : (
        <p className="game-wrap-up__waiting">
          Waiting for the host to reveal scores…
        </p>
      )}
    </main>
  );
}
