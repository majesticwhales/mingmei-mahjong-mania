import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tileImagePath } from "../../lib/tileImages";
import { useGameTeamId, useGame } from "../../state/game/hooks";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import type {
  GameSummaryDto,
  GameSummaryTeamDto,
  SummaryTileDto,
} from "../../wire/summary";

type FetchState =
  | { status: "loading" }
  | { status: "ready"; summary: GameSummaryDto }
  | { status: "error"; error: HttpError };

function endReasonLabel(reason: GameSummaryDto["endReason"]): string {
  switch (reason) {
    case "all_teams_completed":
      return "All teams completed their hands.";
    case "timer":
      return "Time expired.";
    default:
      return reason;
  }
}

function renderTile(tile: SummaryTileDto) {
  return (
    <li className="game-summary__tile" key={`${tile.suit}-${tile.rank}-${tile.copyIndex}`}>
      <img
        src={tileImagePath(tile)}
        alt={tile.displayName}
        title={tile.displayName}
        className="station-panel__tile-image"
      />
    </li>
  );
}

interface TeamCardProps {
  team: GameSummaryTeamDto;
  isWinner: boolean;
  isOwnTeam: boolean;
  rank: number;
}

function TeamCard({ team, isWinner, isOwnTeam, rank }: TeamCardProps) {
  const completed = team.handCompletedAt != null;
  const tenpai = !completed && team.waits != null && team.waits.length > 0;
  const statusLabel = completed
    ? `Won at ${team.winningNodeCode ?? "—"}`
    : tenpai
      ? "Noten — tenpai (analysis below)"
      : "Noten";

  return (
    <article
      className={`game-summary__team${isWinner ? " game-summary__team--winner" : ""}${
        isOwnTeam ? " game-summary__team--own" : ""
      }`}
    >
      <header className="game-summary__team-header">
        <div>
          <p className="game-summary__team-eyebrow">#{rank} · {team.teamCode}</p>
          <h3 className="game-summary__team-title">
            {team.displayName ?? team.teamCode}
          </h3>
          <p className="game-summary__team-status">{statusLabel}</p>
        </div>
        <div className="game-summary__team-score">
          <p className="game-summary__team-points">{team.finalPoints}</p>
          <p className="game-summary__team-points-label">points</p>
        </div>
      </header>
      <dl className="game-summary__stats">
        <div>
          <dt>Han</dt>
          <dd>{team.finalHan}</dd>
        </div>
        <div>
          <dt>Fu</dt>
          <dd>{team.isYakuman ? "—" : team.finalFu}</dd>
        </div>
        {team.isYakuman && (
          <div>
            <dt>Yakuman</dt>
            <dd>Yes</dd>
          </div>
        )}
      </dl>
      {team.finalYaku.length > 0 && (
        <ul className="game-summary__yaku-list">
          {team.finalYaku.map((yaku, idx) => (
            <li key={`${yaku.name}-${idx}`}>
              <span>{yaku.name}</span>
              <span>{yaku.han} han</span>
            </li>
          ))}
        </ul>
      )}
      {team.finalHand.length > 0 && (
        <section className="game-summary__hand">
          <h4>{completed ? "Winning hand" : "Final hand"}</h4>
          <ul className="game-summary__hand-grid">
            {team.finalHand.map(renderTile)}
          </ul>
        </section>
      )}
      {tenpai && team.waits && team.waits.length > 0 && (
        <section className="game-summary__waits">
          <h4>Waits</h4>
          <ul className="game-summary__waits-list">
            {team.waits.map((wait, idx) => (
              <li key={`${wait.tile.suit}-${wait.tile.rank}-${wait.tile.copyIndex}-${idx}`}>
                <img
                  src={tileImagePath(wait.tile)}
                  alt={wait.tile.displayName}
                  className="station-panel__tile-image"
                />
                <span>
                  {wait.tile.displayName} — {wait.isYakuman ? "Yakuman" : `${wait.points} pts`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export function GameSummaryScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { leaveGame } = useGame();
  const gameTeamId = useGameTeamId();
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  // Reset to the loading state during render when the route id changes,
  // rather than via a synchronous setState in the fetch effect. See
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [trackedId, setTrackedId] = useState(id);
  if (trackedId !== id) {
    setTrackedId(id);
    setFetchState({ status: "loading" });
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    restClient
      .getGameSummary(id)
      .then((summary) => {
        if (!cancelled) {
          setFetchState({ status: "ready", summary });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const httpError =
          error instanceof HttpError
            ? error
            : new HttpError("unknown_error", "Failed to load summary", 0);
        setFetchState({ status: "error", error: httpError });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;

  if (fetchState.status === "loading") {
    return (
      <main className="screen screen--loading">
        <p>Loading summary…</p>
      </main>
    );
  }

  if (fetchState.status === "error") {
    const gameStillActive = fetchState.error.message.includes("has not ended yet");
    return (
      <main className="screen">
        <h1 className="screen__title">Game summary unavailable</h1>
        <p>{fetchState.error.message}</p>
        {gameStillActive ? (
          <Link to={`/games/${id}`} className="btn btn--primary">
            Go to game
          </Link>
        ) : null}
        <Link to="/lobbies" className="btn btn--secondary">
          Back to lobbies
        </Link>
      </main>
    );
  }

  const { summary } = fetchState;
  const orderedTeams = [...summary.teams].sort((a, b) => {
    if (b.finalPoints !== a.finalPoints) return b.finalPoints - a.finalPoints;
    // Tie-breaker: earlier completion first; non-completed teams trail.
    const aDone = a.handCompletedAt ? Date.parse(a.handCompletedAt) : Infinity;
    const bDone = b.handCompletedAt ? Date.parse(b.handCompletedAt) : Infinity;
    return aDone - bDone;
  });

  return (
    <main className="screen game-summary">
      <header className="game-summary__header">
        <h1 className="screen__title">Game over</h1>
        <p className="game-summary__subtitle">
          {endReasonLabel(summary.endReason)}{" "}
          <time dateTime={summary.endedAt}>
            ({new Date(summary.endedAt).toLocaleString()})
          </time>
        </p>
        {summary.winningGameTeamId == null && (
          <p className="game-summary__tie">No outright winner — tie on points.</p>
        )}
      </header>
      <section className="game-summary__teams" aria-label="Scoreboard">
        {orderedTeams.map((team, idx) => (
          <TeamCard
            key={team.gameTeamId}
            team={team}
            rank={idx + 1}
            isWinner={team.gameTeamId === summary.winningGameTeamId}
            isOwnTeam={gameTeamId != null && team.gameTeamId === gameTeamId}
          />
        ))}
      </section>
      <footer className="game-summary__footer">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            leaveGame();
            navigate("/lobbies");
          }}
        >
          Back to lobbies
        </button>
      </footer>
    </main>
  );
}
