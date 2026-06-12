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
      ? "Noten — tenpai"
      : "Noten";

  return (
    <article
      className={`game-summary__team${isWinner ? " game-summary__team--winner" : ""}${
        isOwnTeam ? " game-summary__team--own" : ""
      }${completed ? "" : " game-summary__team--incomplete"}`}
    >
      <header className="game-summary__team-header">
        <div className="game-summary__team-intro">
          <div className="game-summary__team-badges">
            <span className="game-summary__rank">#{rank}</span>
            {isWinner && (
              <span className="game-summary__badge game-summary__badge--winner">Winner</span>
            )}
            {isOwnTeam && (
              <span className="game-summary__badge game-summary__badge--own">Your team</span>
            )}
          </div>
          <h3 className="game-summary__team-title">
            {team.displayName ?? team.teamCode}
          </h3>
          <p className="game-summary__team-code">{team.teamCode}</p>
          <p className="game-summary__team-status">{statusLabel}</p>
        </div>
        <div className="game-summary__team-score">
          <p className="game-summary__team-points">
            {team.finalPoints.toLocaleString()}
          </p>
          <p className="game-summary__team-points-label">points</p>
        </div>
      </header>

      {(completed || team.finalHan > 0 || team.finalYaku.length > 0) && (
        <dl className="game-summary__stats">
          <div className="game-summary__stat">
            <dt>Han</dt>
            <dd>{team.finalHan}</dd>
          </div>
          <div className="game-summary__stat">
            <dt>Fu</dt>
            <dd>{team.isYakuman ? "—" : team.finalFu}</dd>
          </div>
          <div className="game-summary__stat">
            <dt>{team.isYakuman ? "Yakuman" : "Score"}</dt>
            <dd>{team.isYakuman ? "Yes" : team.finalPoints.toLocaleString()}</dd>
          </div>
        </dl>
      )}

      {team.finalYaku.length > 0 && (
        <section className="game-summary__score-breakdown">
          <h4 className="game-summary__section-title">Yaku</h4>
          <ul className="game-summary__yaku-list">
            {team.finalYaku.map((yaku, idx) => (
              <li key={`${yaku.name}-${idx}`}>
                <span className="game-summary__yaku-name">{yaku.name}</span>
                <span className="game-summary__yaku-han">{yaku.han} han</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {team.finalHand.length > 0 && (
        <section className="game-summary__hand">
          <h4 className="game-summary__section-title">
            {completed ? "Winning hand" : "Final hand"}
          </h4>
          <ul className="game-summary__hand-grid">
            {team.finalHand.map(renderTile)}
          </ul>
        </section>
      )}

      {tenpai && team.waits && team.waits.length > 0 && (
        <section className="game-summary__waits">
          <h4 className="game-summary__section-title">Tenpai waits</h4>
          <ul className="game-summary__waits-list">
            {team.waits.map((wait, idx) => (
              <li key={`${wait.tile.suit}-${wait.tile.rank}-${wait.tile.copyIndex}-${idx}`}>
                <img
                  src={tileImagePath(wait.tile)}
                  alt={wait.tile.displayName}
                  className="station-panel__tile-image"
                />
                <span className="game-summary__wait-copy">
                  <span className="game-summary__wait-name">{wait.tile.displayName}</span>
                  <span className="game-summary__wait-score">
                    {wait.isYakuman
                      ? "Yakuman"
                      : `${wait.han} han / ${wait.fu} fu · ${wait.points.toLocaleString()} pts`}
                  </span>
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
  const winningTeam =
    summary.winningGameTeamId != null
      ? summary.teams.find((t) => t.gameTeamId === summary.winningGameTeamId) ?? null
      : null;

  return (
    <main className="screen game-summary">
      <header className="game-summary__header">
        <p className="game-summary__eyebrow">Final results</p>
        <h1 className="game-summary__title">Game over</h1>
        <p className="game-summary__subtitle">
          {endReasonLabel(summary.endReason)}
        </p>
        <time className="game-summary__ended-at" dateTime={summary.endedAt}>
          Ended {new Date(summary.endedAt).toLocaleString()}
        </time>
        {winningTeam ? (
          <div className="game-summary__winner-banner">
            <p className="game-summary__winner-label">Winner</p>
            <p className="game-summary__winner-name">
              {winningTeam.displayName ?? winningTeam.teamCode}
            </p>
            <p className="game-summary__winner-score">
              {winningTeam.finalPoints.toLocaleString()} points
              {winningTeam.winningNodeCode
                ? ` · Won at ${winningTeam.winningNodeCode}`
                : ""}
            </p>
          </div>
        ) : (
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
        <Link to={`/games/${id}?view=map`} className="btn btn--secondary">
          View map
        </Link>
        <button
          type="button"
          className="btn btn--primary"
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
