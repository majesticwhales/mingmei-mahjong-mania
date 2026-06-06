import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { tileImagePath } from "../../lib/tileImages";
import { useEventLog, useGame, useGameProjection } from "../../state/game/hooks";
import { EventLogDrawer } from "../Game/EventLogDrawer";

export function GameSummaryScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, joinGame, leaveGame } = useGame();
  const projection = useGameProjection();
  const eventLog = useEventLog();

  useEffect(() => {
    if (!id) return;
    if (state.status === "absent" || (state.status === "active" && state.id !== id)) {
      void joinGame(id);
    }
  }, [id, joinGame, state]);

  if (!projection) {
    return (
      <main className="screen screen--loading">
        <p>Loading summary…</p>
      </main>
    );
  }

  const stubScore = projection.handAnalysis?.score as number | undefined;

  return (
    <main className="screen">
      <h1 className="screen__title">Game over</h1>
      <section>
        <h2 className="form__section-title">Final hand</h2>
        <ul className="station-panel__tile-grid">
          {projection.handTiles.map((tile) => (
            <li key={tile.instanceId}>
              <img
                src={tileImagePath(tile)}
                alt={tile.displayName}
                className="station-panel__tile-image"
              />
            </li>
          ))}
        </ul>
      </section>
      <p>Stub score: {stubScore ?? "TBD"}</p>
      <section>
        <h2 className="form__section-title">Event log</h2>
        <EventLogDrawer events={eventLog} open onClose={() => undefined} />
      </section>
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
      <p className="screen__footer">
        <Link to="/lobbies">Lobbies</Link>
      </p>
    </main>
  );
}
