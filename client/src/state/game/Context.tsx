import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { emitGameJoin, onSocketEvent } from "../../transport/socketClient";
import { HttpError } from "../../transport/httpError";
import type { CommandType } from "../../wire/command";
import { useConnection } from "../connection/hooks";
import { useOutbox } from "../outbox/hooks";
import { gameReducer } from "./reducer";
import type { GameState } from "./types";

const RESYNC_TERMINAL_CODES = new Set(["forbidden", "unauthenticated"]);

function resyncBackoffMs(attempt: number) {
  return Math.min(2 ** attempt * 500, 10_000);
}

interface GameContextValue {
  state: GameState;
  joinGame: (id: string) => Promise<void>;
  resyncGame: () => Promise<void>;
  submitCommand: (
    commandType: CommandType | string,
    payload?: Record<string, unknown>,
  ) => Promise<string>;
  dismissNotification: (id: string) => void;
  leaveGame: () => void;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, { status: "absent" });
  const { state: connState } = useConnection();
  const { enqueue } = useOutbox();
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resyncAttemptRef = useRef(0);
  const activeGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeGameIdRef.current = state.status === "active" ? state.id : null;
  }, [state]);

  const clearResyncTimer = useCallback(() => {
    if (resyncTimerRef.current) {
      clearTimeout(resyncTimerRef.current);
      resyncTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearResyncTimer();
  }, [clearResyncTimer]);

  useEffect(() => {
    const unsubState = onSocketEvent("game.state", (projection) => {
      dispatch({ type: "game/state", projection });
    });
    const unsubEvent = onSocketEvent("game.event", (event) => {
      dispatch({ type: "game/event", event });
    });
    const unsubNotification = onSocketEvent("game.notification", (payload) => {
      dispatch({
        type: "game/notification",
        template: payload.template,
        data: payload.data,
        at: new Date().toISOString(),
      });
    });
    return () => {
      unsubState();
      unsubEvent();
      unsubNotification();
    };
  }, []);

  const resyncActiveGame = useCallback(
    async (id: string) => {
      if (connState.status !== "connected") return;
      if (activeGameIdRef.current !== id) return;

      clearResyncTimer();

      const tryResync = async (attempt: number): Promise<void> => {
        try {
          const result = await emitGameJoin(id);
          if (activeGameIdRef.current !== id) return;
          resyncAttemptRef.current = 0;
          dispatch({
            type: "game/resynced",
            gameTeamId: result.gameTeamId,
            projection: result.state,
          });
        } catch (error) {
          if (activeGameIdRef.current !== id) return;
          if (
            error instanceof HttpError &&
            RESYNC_TERMINAL_CODES.has(error.code)
          ) {
            resyncAttemptRef.current = 0;
            return;
          }
          resyncAttemptRef.current = attempt + 1;
          resyncTimerRef.current = setTimeout(() => {
            void tryResync(attempt + 1);
          }, resyncBackoffMs(attempt));
        }
      };

      await tryResync(resyncAttemptRef.current);
    },
    [clearResyncTimer, connState.status],
  );

  const joinGame = useCallback(
    async (id: string) => {
      const resyncing = state.status === "active" && state.id === id;
      if (!resyncing) {
        dispatch({ type: "game/load", id });
      }
      if (connState.status !== "connected") {
        return;
      }
      if (resyncing) {
        await resyncActiveGame(id);
        return;
      }
      try {
        const result = await emitGameJoin(id);
        dispatch({
          type: "game/loaded",
          id,
          gameTeamId: result.gameTeamId,
          projection: result.state,
        });
      } catch (error) {
        dispatch({
          type: "game/load/failed",
          id,
          error:
            error instanceof HttpError
              ? error
              : new HttpError("unknown_error", "Failed to join game", 0),
        });
      }
    },
    [connState.status, resyncActiveGame, state],
  );

  const prevConnStatus = useRef(connState.status);
  useEffect(() => {
    const becameConnected =
      prevConnStatus.current !== "connected" && connState.status === "connected";
    prevConnStatus.current = connState.status;

    if (!becameConnected) return;

    if (state.status === "active") {
      void resyncActiveGame(state.id);
      return;
    }
    if (state.status === "loading") {
      void joinGame(state.id).catch(() => undefined);
    }
  }, [connState.status, joinGame, resyncActiveGame, state]);

  const handlePageVisible = useCallback(() => {
    if (state.status === "active") {
      void resyncActiveGame(state.id);
    }
  }, [resyncActiveGame, state]);

  usePageVisibility(handlePageVisible);

  const submitCommand = useCallback(
    async (commandType: CommandType | string, payload: Record<string, unknown> = {}) => {
      if (state.status !== "active") {
        throw new HttpError("invalid_state", "Game not active", 400);
      }
      const clientCommandId = crypto.randomUUID();
      await enqueue({
        clientCommandId,
        gameId: state.id,
        gameTeamId: state.gameTeamId,
        commandType,
        payload,
      });
      return clientCommandId;
    },
    [enqueue, state],
  );

  const dismissNotification = useCallback((id: string) => {
    dispatch({ type: "game/notification/dismiss", id });
  }, []);

  const leaveGame = useCallback(() => {
    clearResyncTimer();
    resyncAttemptRef.current = 0;
    dispatch({ type: "game/leave" });
  }, [clearResyncTimer]);

  const resyncGame = useCallback(async () => {
    if (state.status !== "active") return;
    await resyncActiveGame(state.id);
  }, [resyncActiveGame, state]);

  const value = useMemo(
    () => ({
      state,
      joinGame,
      resyncGame,
      submitCommand,
      dismissNotification,
      leaveGame,
    }),
    [state, joinGame, resyncGame, submitCommand, dismissNotification, leaveGame],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
