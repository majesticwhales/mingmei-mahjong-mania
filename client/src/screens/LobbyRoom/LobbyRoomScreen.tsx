import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { HttpError } from "../../transport/httpError";
import { useAuth, useIsAdmin } from "../../state/auth/hooks";
import { useGame } from "../../state/game/hooks";
import { useIsHost, useLobby, useLobbyMembers } from "../../state/lobby/hooks";
import { MemberList } from "./MemberList";
import { TeamPicker } from "./TeamPicker";
import { lobbyJoinErrorMessage } from "./useLobbyAutoJoin";
import type { LobbyStatus } from "../../wire/lobby";

export function LobbyRoomScreen() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const { state, loadLobby, createLobby, pickTeam, startLobby } = useLobby();
  const { leaveGame } = useGame();
  const isHost = useIsHost();
  const isAdmin = useIsAdmin();
  const members = useLobbyMembers();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevLobbyStatusRef = useRef<LobbyStatus | null>(null);
  const testGame =
    (location.state as { testGame?: boolean } | null)?.testGame === true;

  useEffect(() => {
    if (!id) return;
    if (id === "new") {
      if (authState.status !== "authenticated" || !authState.user.isAdmin) {
        navigate("/lobbies", { replace: true });
        return;
      }
      void createLobby({ isTestGame: testGame }).then((lobby) =>
        navigate(`/lobbies/${lobby.id}`, { replace: true }),
      );
      return;
    }
    void loadLobby(id);
  }, [id, loadLobby, createLobby, navigate, authState, testGame]);

  // Drop any in-memory game session when entering a lobby so a prior
  // ended game cannot leak into the next start/join flow.
  useEffect(() => {
    if (!id || id === "new") return;
    prevLobbyStatusRef.current = null;
    leaveGame();
  }, [id, leaveGame]);

  // Navigate to the game only when this lobby actually starts — not when
  // reopening an already-closed lobby whose game may have ended.
  useEffect(() => {
    if (state.status !== "ready") return;

    const { status, gameId } = state.lobby;
    const previousStatus = prevLobbyStatusRef.current;
    prevLobbyStatusRef.current = status;

    if (!gameId) return;

    const justStarted =
      previousStatus === "waiting" && status !== "waiting";
    const joinedDuringStart = previousStatus == null && status === "starting";

    if (justStarted || joinedDuringStart) {
      navigate(`/games/${gameId}`);
    }
  }, [navigate, state]);

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
        <p>{lobbyJoinErrorMessage(state.error)}</p>
        <Link to="/lobbies" className="btn btn--secondary">
          Back to lobbies
        </Link>
      </main>
    );
  }

  if (state.status !== "ready") return null;

  const { lobby } = state;

  if (lobby.status === "closed" && lobby.gameId) {
    return (
      <main className="screen screen--hub">
        <header className="screen__header">
          <Link to="/lobbies" className="btn btn--ghost">
            Back
          </Link>
          <ConnectionBadge />
        </header>
        <h1 className="screen__title">Lobby {lobby.id.slice(0, 8)}</h1>
        <p className="screen__subtitle">
          This lobby&apos;s game has already started or finished. Wait here for the host to
          create a new lobby, or open the previous game below.
        </p>
        <Link to={`/games/${lobby.gameId}`} className="btn btn--secondary">
          Open game
        </Link>
        <Link to={`/games/${lobby.gameId}/summary`} className="btn btn--ghost">
          View summary
        </Link>
      </main>
    );
  }

  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      leaveGame();
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
      {isAdmin ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!lobby.readiness.ready || starting}
          onClick={handleStart}
        >
          {starting ? "Starting…" : "Start game"}
        </button>
      ) : (
        <p className="screen__subtitle">Waiting for an admin to start the game…</p>
      )}
      {!lobby.readiness.ready && (
        <p className="form__error">{lobby.readiness.reasons.join(" · ")}</p>
      )}
      {lobby.readiness.soloStartAllowed &&
        lobby.readiness.ready &&
        lobby.readiness.memberCount < 4 && (
          <p className="screen__subtitle">
            Test mode: you can start with fewer than four players.
          </p>
        )}
      {error && <p className="form__error">{error}</p>}
    </main>
  );
}
