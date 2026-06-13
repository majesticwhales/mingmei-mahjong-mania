import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLockDocumentScroll } from "../../hooks/useLockDocumentScroll";
import { useTimerExpired } from "../../hooks/useTimerExpired";
import { useIsAdmin } from "../../state/auth/hooks";
import { useGame, useGameProjection } from "../../state/game/hooks";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";

const GATHERING_STATION_CODE = "bay";

function resolveGatheringStationName(
  mapNodes: ReadonlyArray<{ code: string; name: string }> | undefined,
): string {
  const station = mapNodes?.find((node) => node.code === GATHERING_STATION_CODE);
  return station?.name ?? "Bay Station";
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
        <h1 className="game-wrap-up__title">Return to {gatheringStationName}</h1>
      </header>

      <p className="game-wrap-up__message">
        The timer has run out or the game has ended. Please head back to{" "}
        <strong>{gatheringStationName}</strong> so everyone can regroup before scores are
        revealed.
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
