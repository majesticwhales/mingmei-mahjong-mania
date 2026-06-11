import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useIsAdmin } from "../../state/auth/hooks";

export function LobbiesScreen() {
  const { state, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [lobbyId, setLobbyId] = useState("");
  const [testGame, setTestGame] = useState(false);

  if (state.status !== "authenticated") return null;

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const trimmed = lobbyId.trim();
    if (!trimmed) return;
    navigate(`/lobbies/${trimmed}`);
  }

  return (
    <main className="screen screen--hub">
      <header className="screen__header">
        <span className="screen__user">@{state.user.username}</span>
        <button type="button" className="btn btn--ghost" onClick={logout}>
          Log out
        </button>
      </header>
      <h1 className="screen__title">Lobbies</h1>
      {isAdmin ? (
        <section className="lobbies-create" aria-label="Create lobby">
          <label className="lobbies-create__test-option">
            <input
              type="checkbox"
              checked={testGame}
              onChange={(e) => setTestGame(e.target.checked)}
            />
            <span className="lobbies-create__test-copy">
              <span className="lobbies-create__test-label">Test game</span>
              <span className="lobbies-create__test-hint">
                4 min duration · phases at 1 and 2 min
              </span>
            </span>
          </label>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => navigate("/lobbies/new", { state: { testGame } })}
          >
            + Create new lobby
          </button>
        </section>
      ) : null}
      <form className="form form--inline" onSubmit={handleJoin}>
        <h2 className="form__section-title">Join existing lobby</h2>
        <label className="form__field">
          <span>Lobby id</span>
          <input
            value={lobbyId}
            onChange={(e) => setLobbyId(e.target.value)}
            placeholder="Paste lobby id"
          />
        </label>
        <button className="btn btn--secondary" type="submit">
          Join
        </button>
      </form>
    </main>
  );
}
