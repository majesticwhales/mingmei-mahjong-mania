import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useIsAdmin } from "../../state/auth/hooks";

export function LobbiesScreen() {
  const { state, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [lobbyId, setLobbyId] = useState("");

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
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => navigate("/lobbies/new", { replace: false })}
        >
          + Create new lobby
        </button>
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
