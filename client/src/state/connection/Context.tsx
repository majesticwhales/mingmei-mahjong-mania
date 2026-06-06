import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import {
  createSocket,
  destroySocket,
  getSocket,
  onSocketLifecycle,
} from "../../transport/socketClient";
import { connectionReducer } from "./reducer";
import type { ConnectionState } from "./types";

interface ConnectionContextValue {
  state: ConnectionState;
  retry: () => void;
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface Props {
  token: string | null;
  children: ReactNode;
}

export function ConnectionProvider({ token, children }: Props) {
  const [state, dispatch] = useReducer(connectionReducer, { status: "idle" });

  const handleVisibility = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    if (!socket.connected) {
      dispatch({ type: "conn/connect/started", attempt: 0 });
      socket.connect();
    }
  }, []);

  usePageVisibility(handleVisibility);

  useEffect(() => {
    if (!token) {
      destroySocket();
      dispatch({ type: "conn/reset" });
      return;
    }

    dispatch({ type: "conn/connect/started", attempt: 0 });
    createSocket(token);

    const unsubscribe = onSocketLifecycle((event, ...args) => {
      if (event === "connect") {
        dispatch({ type: "conn/connect/succeeded", at: Date.now() });
      } else if (event === "disconnect") {
        const reason = typeof args[0] === "string" ? args[0] : "disconnect";
        dispatch({ type: "conn/disconnect", reason, attempt: 0 });
      } else if (event === "connect_error") {
        const err = args[0] as { message?: string } | undefined;
        dispatch({
          type: "conn/disconnect",
          reason: err?.message ?? "connect_error",
          attempt: 0,
        });
      } else if (event === "reconnect_attempt") {
        const attempt = typeof args[0] === "number" ? args[0] : 0;
        dispatch({
          type: "conn/reconnect/scheduled",
          attempt,
          nextAttemptAt: Date.now() + 1000,
        });
      } else if (event === "reconnect_failed") {
        dispatch({ type: "conn/give-up", reason: "max_retries" });
      }
    });

    return () => {
      unsubscribe();
      destroySocket();
      dispatch({ type: "conn/reset" });
    };
  }, [token]);

  const retry = useCallback(() => {
    dispatch({ type: "conn/retry-requested" });
    const socket = getSocket();
    socket?.connect();
  }, []);

  const value = useMemo(() => ({ state, retry }), [state, retry]);

  return (
    <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
  );
}
