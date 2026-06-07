import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { emitGameJoin, onSocketEvent } from "../../transport/socketClient";
import { HttpError } from "../../transport/httpError";
import type { CommandType } from "../../wire/command";
import { useConnection } from "../connection/hooks";
import { useOutbox } from "../outbox/hooks";
import { gameReducer } from "./reducer";
import type { GameState } from "./types";

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

  const joinGame = useCallback(async (id: string) => {
    const alreadyActive = state.status === "active" && state.id === id;
    if (!alreadyActive) {
      dispatch({ type: "game/load", id });
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
      if (!alreadyActive) {
        dispatch({
          type: "game/load/failed",
          id,
          error:
            error instanceof HttpError
              ? error
              : new HttpError("unknown_error", "Failed to join game", 0),
        });
      }
    }
  }, [state]);

  const prevConnStatus = useRef(connState.status);
  useEffect(() => {
    const reconnected =
      (prevConnStatus.current === "disconnected" ||
        prevConnStatus.current === "reconnecting") &&
      connState.status === "connected";
    prevConnStatus.current = connState.status;
    if (state.status === "active" && reconnected) {
      void joinGame(state.id).catch(() => undefined);
    }
  }, [connState.status, joinGame, state]);

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
    dispatch({ type: "game/leave" });
  }, []);

  const resyncGame = useCallback(async () => {
    if (state.status !== "active") return;
    await joinGame(state.id);
  }, [joinGame, state]);

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
