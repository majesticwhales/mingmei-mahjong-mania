import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { HttpError } from "../../transport/httpError";
import { useAuth } from "../../state/auth/hooks";
import { useIsHost, useLobby, useLobbyMembers, useLobbyNotifications } from "../../state/lobby/hooks";
import { ConfigForm, type ConfigFormHandle } from "./ConfigForm";
import { MemberList } from "./MemberList";
import { NotificationsEditor } from "./NotificationsEditor";
import { TeamPicker } from "./TeamPicker";

export function LobbyRoomScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const {
    state,
    loadLobby,
    createLobby,
    joinLobby,
    pickTeam,
    updateConfig,
    addNotification,
    updateNotification,
    removeNotification,
    startLobby,
  } = useLobby();
  const isHost = useIsHost();
  const members = useLobbyMembers();
  const notifications = useLobbyNotifications();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configFormRef = useRef<ConfigFormHandle>(null);

  useEffect(() => {
    if (!id) return;
    if (id === "new") {
      void createLobby().then((lobby) => navigate(`/lobbies/${lobby.id}`, { replace: true }));
      return;
    }
    void loadLobby(id);
  }, [id, loadLobby, createLobby, navigate]);

  // Auto-navigate every lobby member (host included) to the game screen
  // once the server flips the lobby out of `waiting` and the `lobby.config`
  // broadcast carries a non-null `gameId`. This is what makes non-host
  // clients leave the lobby UI when the host clicks Start — the host's
  // own REST-driven `navigate` in `handleStart` is then just a redundant
  // safety net for the same gameId.
  const targetGameId =
    state.status === "ready" && state.lobby.status !== "waiting"
      ? state.lobby.gameId
      : null;
  useEffect(() => {
    if (targetGameId) {
      navigate(`/games/${targetGameId}`);
    }
  }, [targetGameId, navigate]);

  const myTeamSlot = useMemo(() => {
    if (authState.status !== "authenticated" || state.status !== "ready") return null;
    return (
      state.lobby.members.find((member) => member.userId === authState.user.id)?.teamSlot ?? null
    );
  }, [authState, state]);

  if (!id || id === "new") {
    return (
      <main className="screen screen--loading">
        <p>Creating lobby…</p>
      </main>
    );
  }

  if (state.status === "loading") {
    return (
      <main className="screen screen--loading">
        <p>Loading lobby…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="screen">
        <p>{state.error.message}</p>
        <button type="button" className="btn btn--secondary" onClick={() => void joinLobby(id)}>
          Try join
        </button>
      </main>
    );
  }

  if (state.status !== "ready") return null;

  const { lobby } = state;

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      await configFormRef.current?.savePendingChanges();
      const gameId = await startLobby();
      navigate(`/games/${gameId}`);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not start game");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="screen screen--hub">
      <header className="screen__header">
        <Link to="/lobbies" className="btn btn--ghost">
          Back
        </Link>
        <ConnectionBadge />
      </header>
      <h1 className="screen__title">
        Lobby {lobby.id.slice(0, 8)} {isHost ? "HOST" : ""}
      </h1>
      <MemberList members={members} hostUserId={lobby.hostUserId} />
      <TeamPicker
        value={myTeamSlot}
        onPick={(teamSlot) => {
          void pickTeam(teamSlot).catch((err) => {
            setError(err instanceof HttpError ? err.message : "Could not pick team");
          });
        }}
      />
      {isHost ? (
        <>
          <ConfigForm ref={configFormRef} config={lobby.config} onSave={updateConfig} />
          <NotificationsEditor
            notifications={notifications}
            onAdd={addNotification}
            onUpdate={updateNotification}
            onRemove={removeNotification}
          />
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!lobby.readiness.ready || starting}
            onClick={handleStart}
          >
            {starting ? "Starting…" : "Start game"}
          </button>
        </>
      ) : (
        <p className="screen__subtitle">Waiting for host…</p>
      )}
      {!lobby.readiness.ready && (
        <p className="form__error">{lobby.readiness.reasons.join(" · ")}</p>
      )}
      {import.meta.env.DEV && lobby.readiness.ready && lobby.readiness.memberCount < 4 && (
        <p className="screen__subtitle">Dev mode: solo start enabled (server DEV_RELAX_LOBBY_START).</p>
      )}
      {error && <p className="form__error">{error}</p>}
    </main>
  );
}
