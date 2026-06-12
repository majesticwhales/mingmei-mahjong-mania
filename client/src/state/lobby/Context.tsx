import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { restClient } from "../../transport/restClient";
import { emitLobbyJoin, onSocketEvent } from "../../transport/socketClient";
import { HttpError } from "../../transport/httpError";
import type {
  CreateLobbyInput,
  LobbyConfigPatch,
  LobbyDetailDto,
} from "../../wire/lobby";
import { useAutoJoinAttemptTracker } from "../../screens/LobbyRoom/useLobbyAutoJoin";
import { useAuth } from "../auth/hooks";
import { useConnection } from "../connection/hooks";
import { lobbyReducer } from "./reducer";
import type { LobbyState } from "./types";

interface LobbyContextValue {
  state: LobbyState;
  loadLobby: (id: string) => Promise<void>;
  createLobby: (input?: CreateLobbyInput) => Promise<LobbyDetailDto>;
  joinLobby: (id: string) => Promise<LobbyDetailDto>;
  pickTeam: (teamSlot: number | null) => Promise<void>;
  updateConfig: (patch: LobbyConfigPatch) => Promise<void>;
  addNotification: (input: {
    atSeconds: number;
    template: string;
    data?: Record<string, unknown> | null;
  }) => Promise<void>;
  updateNotification: (
    notifId: string,
    patch: Partial<{ atSeconds: number; template: string; data: Record<string, unknown> | null }>,
  ) => Promise<void>;
  removeNotification: (notifId: string) => Promise<void>;
  startLobby: () => Promise<string>;
  leaveLobby: () => void;
}

export const LobbyContext = createContext<LobbyContextValue | null>(null);

export function LobbyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(lobbyReducer, { status: "absent" });
  const { state: authState } = useAuth();
  const { state: connState } = useConnection();
  const userId = authState.status === "authenticated" ? authState.user.id : null;
  const { shouldAutoJoin, markAutoJoinAttempted } = useAutoJoinAttemptTracker(userId);

  useEffect(() => {
    return onSocketEvent("lobby.config", (lobby) => {
      dispatch({ type: "lobby/updated", lobby });
    });
  }, []);

  const fetchLobby = useCallback(async (id: string) => {
    dispatch({ type: "lobby/load", id });
    try {
      const [{ lobby }, socketLobby] = await Promise.all([
        restClient.getLobby(id),
        connState.status === "connected"
          ? emitLobbyJoin(id).catch(() => null)
          : Promise.resolve(null),
      ]);
      dispatch({ type: "lobby/loaded", id, lobby: socketLobby ?? lobby });
    } catch (error) {
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError("unknown_error", "Failed to load lobby", 0);

      if (shouldAutoJoin(id, httpError)) {
        markAutoJoinAttempted(id);
        try {
          const { lobby } = await restClient.joinLobby(id);
          dispatch({ type: "lobby/loaded", id, lobby });
          if (connState.status === "connected") {
            await emitLobbyJoin(id).catch(() => undefined);
          }
          return;
        } catch (joinError) {
          dispatch({
            type: "lobby/load/failed",
            id,
            error:
              joinError instanceof HttpError
                ? joinError
                : new HttpError("unknown_error", "Failed to join lobby", 0),
          });
          return;
        }
      }

      dispatch({
        type: "lobby/load/failed",
        id,
        error: httpError,
      });
    }
  }, [connState.status, shouldAutoJoin, markAutoJoinAttempted]);

  const prevConnStatus = useRef(connState.status);
  useEffect(() => {
    const reconnected =
      (prevConnStatus.current === "disconnected" ||
        prevConnStatus.current === "reconnecting") &&
      connState.status === "connected";
    prevConnStatus.current = connState.status;
    if (state.status === "ready" && reconnected) {
      void emitLobbyJoin(state.id).catch(() => undefined);
    }
  }, [connState.status, state]);

  const createLobby = useCallback(async (input?: CreateLobbyInput) => {
    const { lobby } = await restClient.createLobby(input);
    dispatch({ type: "lobby/loaded", id: lobby.id, lobby });
    return lobby;
  }, []);

  const joinLobby = useCallback(async (id: string) => {
    const { lobby } = await restClient.joinLobby(id);
    dispatch({ type: "lobby/loaded", id, lobby });
    if (connState.status === "connected") {
      await emitLobbyJoin(id).catch(() => undefined);
    }
    return lobby;
  }, [connState.status]);

  const pickTeam = useCallback(
    async (teamSlot: number | null) => {
      if (state.status !== "ready" || !userId) return;
      const member = state.lobby.members.find((m) => m.userId === userId);
      const previousTeamSlot = member?.teamSlot ?? null;
      dispatch({
        type: "lobby/team/optimistic",
        userId,
        teamSlot,
        previousTeamSlot,
      });
      try {
        await restClient.pickTeam(state.id, teamSlot);
      } catch (error) {
        dispatch({ type: "lobby/team/rolled-back", userId });
        throw error;
      }
    },
    [state, userId],
  );

  const updateConfig = useCallback(
    async (patch: LobbyConfigPatch) => {
      if (state.status !== "ready") return;
      const { lobby } = await restClient.updateLobbyConfig(state.id, patch);
      dispatch({ type: "lobby/updated", lobby });
    },
    [state],
  );

  const addNotification = useCallback(
    async (input: {
      atSeconds: number;
      template: string;
      data?: Record<string, unknown> | null;
    }) => {
      if (state.status !== "ready") return;
      await restClient.addNotification(state.id, input);
    },
    [state],
  );

  const updateNotification = useCallback(
    async (
      notifId: string,
      patch: Partial<{ atSeconds: number; template: string; data: Record<string, unknown> | null }>,
    ) => {
      if (state.status !== "ready") return;
      await restClient.updateNotification(state.id, notifId, patch);
    },
    [state],
  );

  const removeNotification = useCallback(
    async (notifId: string) => {
      if (state.status !== "ready") return;
      await restClient.deleteNotification(state.id, notifId);
    },
    [state],
  );

  const startLobby = useCallback(async () => {
    if (state.status !== "ready") {
      throw new HttpError("invalid_state", "Lobby not ready", 400);
    }
    const result = await restClient.startLobby(state.id);
    return result.gameId;
  }, [state]);

  const leaveLobby = useCallback(() => {
    if (state.status === "ready" || state.status === "loading") {
      dispatch({ type: "lobby/leave", id: state.id });
    }
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      loadLobby: fetchLobby,
      createLobby,
      joinLobby,
      pickTeam,
      updateConfig,
      addNotification,
      updateNotification,
      removeNotification,
      startLobby,
      leaveLobby,
    }),
    [
      state,
      fetchLobby,
      createLobby,
      joinLobby,
      pickTeam,
      updateConfig,
      addNotification,
      updateNotification,
      removeNotification,
      startLobby,
      leaveLobby,
    ],
  );

  return <LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>;
}
