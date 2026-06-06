import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  enqueueRow,
  hydrateOutbox,
  updateRow,
  type OutboxRow,
} from "../../transport/commandOutbox";
import { useIsOnline } from "../connection/hooks";
import { backoffMs, classifyError, drainRow, sleep } from "./drainLoop";
import { outboxReducer } from "./reducer";
import type { OutboxState } from "./types";

interface OutboxContextValue {
  state: OutboxState;
  enqueue: (input: Omit<OutboxRow, "enqueuedAt" | "status" | "attempts">) => Promise<string>;
  dismissBanner: () => void;
  dismissToast: (id: string) => void;
}

export const OutboxContext = createContext<OutboxContextValue | null>(null);

const initialState: OutboxState = {
  byGame: {},
  draining: false,
  conflictBanner: null,
  toasts: [],
};

export function OutboxProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(outboxReducer, initialState);
  const isOnline = useIsOnline();
  const stateRef = useRef(state);
  const drainingRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    hydrateOutbox().then((rows) => {
      dispatch({ type: "outbox/hydrated", rows });
    });
  }, []);

  const runDrain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    dispatch({ type: "outbox/drain/started" });
    try {
      while (true) {
        const pending = Object.values(stateRef.current.byGame)
          .flat()
          .filter((row) => row.status === "pending")
          .sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0];
        if (!pending) break;

        dispatch({ type: "outbox/in-flight", clientCommandId: pending.clientCommandId });
        const inFlight: OutboxRow = { ...pending, status: "in_flight" };
        await updateRow(inFlight);

        try {
          await drainRow(pending, isOnline);
          dispatch({ type: "outbox/acked", clientCommandId: pending.clientCommandId });
          await updateRow({ ...pending, status: "acked" });
        } catch (error) {
          const classified = classifyError(error);
          if (classified.duplicate) {
            dispatch({ type: "outbox/acked", clientCommandId: pending.clientCommandId });
            await updateRow({ ...pending, status: "acked" });
            continue;
          }
          if (classified.conflict) {
            dispatch({
              type: "outbox/conflict",
              gameId: pending.gameId,
              clientCommandId: pending.clientCommandId,
            });
            await updateRow({
              ...pending,
              status: "rejected",
              lastError: { code: classified.code, message: classified.message },
            });
            continue;
          }
          if (classified.terminal) {
            dispatch({
              type: "outbox/rejected",
              clientCommandId: pending.clientCommandId,
              error: { code: classified.code, message: classified.message },
              terminal: true,
            });
            await updateRow({
              ...pending,
              status: "rejected",
              lastError: { code: classified.code, message: classified.message },
            });
            continue;
          }
          const retried: OutboxRow = {
            ...pending,
            status: "pending",
            attempts: pending.attempts + 1,
            lastError: { code: classified.code, message: classified.message },
          };
          dispatch({
            type: "outbox/rejected",
            clientCommandId: pending.clientCommandId,
            error: { code: classified.code, message: classified.message },
            terminal: false,
          });
          await updateRow(retried);
          await sleep(backoffMs(retried.attempts));
        }
      }
    } finally {
      drainingRef.current = false;
      dispatch({ type: "outbox/drain/finished" });
    }
  }, [isOnline]);

  useEffect(() => {
    const hasPending = Object.values(state.byGame).some((rows) =>
      rows.some((row) => row.status === "pending"),
    );
    if (hasPending) {
      void runDrain();
    }
  }, [state.byGame, isOnline, runDrain]);

  const enqueue = useCallback(
    async (input: Omit<OutboxRow, "enqueuedAt" | "status" | "attempts">) => {
      const row: OutboxRow = {
        ...input,
        enqueuedAt: Date.now(),
        status: "pending",
        attempts: 0,
      };
      await enqueueRow(row);
      dispatch({ type: "outbox/enqueued", row });
      return row.clientCommandId;
    },
    [],
  );

  const dismissBanner = useCallback(() => {
    dispatch({ type: "outbox/banner/dismissed" });
  }, []);

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: "outbox/toast/dismiss", id });
  }, []);

  const value = useMemo(
    () => ({ state, enqueue, dismissBanner, dismissToast }),
    [state, enqueue, dismissBanner, dismissToast],
  );

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>;
}
