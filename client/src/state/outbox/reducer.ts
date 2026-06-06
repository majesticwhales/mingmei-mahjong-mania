import type { OutboxRow } from "../../transport/commandOutbox";
import type { OutboxAction, OutboxState } from "./types";

function sortRows(rows: OutboxRow[]) {
  return [...rows].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

function upsertRow(byGame: Record<string, OutboxRow[]>, row: OutboxRow) {
  const list = byGame[row.gameId] ?? [];
  const next = sortRows([
    ...list.filter((item) => item.clientCommandId !== row.clientCommandId),
    row,
  ]);
  return { ...byGame, [row.gameId]: next };
}

function removeRow(byGame: Record<string, OutboxRow[]>, clientCommandId: string, gameId: string) {
  const list = byGame[gameId] ?? [];
  const next = list.filter((item) => item.clientCommandId !== clientCommandId);
  if (next.length === 0) {
    const { [gameId]: _removed, ...rest } = byGame;
    return rest;
  }
  return { ...byGame, [gameId]: next };
}

function updateRow(
  byGame: Record<string, OutboxRow[]>,
  clientCommandId: string,
  updater: (row: OutboxRow) => OutboxRow | null,
) {
  let nextByGame = { ...byGame };
  for (const [gid, rows] of Object.entries(byGame)) {
    const index = rows.findIndex((row) => row.clientCommandId === clientCommandId);
    if (index >= 0) {
      const current = rows[index];
      const updated = updater(current);
      if (!updated) {
        nextByGame = removeRow(nextByGame, clientCommandId, gid);
      } else {
        const nextRows = [...rows];
        nextRows[index] = updated;
        nextByGame = { ...nextByGame, [gid]: sortRows(nextRows) };
      }
      break;
    }
  }
  return nextByGame;
}

export function outboxReducer(state: OutboxState, action: OutboxAction): OutboxState {
  switch (action.type) {
    case "outbox/hydrated": {
      const byGame: Record<string, OutboxRow[]> = {};
      for (const row of action.rows) {
        byGame[row.gameId] = sortRows([...(byGame[row.gameId] ?? []), row]);
      }
      return { ...state, byGame };
    }
    case "outbox/enqueued":
      return { ...state, byGame: upsertRow(state.byGame, action.row) };
    case "outbox/in-flight":
      return {
        ...state,
        byGame: updateRow(state.byGame, action.clientCommandId, (row) => ({
          ...row,
          status: "in_flight",
        })),
      };
    case "outbox/acked":
      return {
        ...state,
        byGame: updateRow(state.byGame, action.clientCommandId, () => null),
      };
    case "outbox/rejected": {
      const terminal = action.terminal ?? true;
      return {
        ...state,
        byGame: terminal
          ? updateRow(state.byGame, action.clientCommandId, () => null)
          : updateRow(state.byGame, action.clientCommandId, (row) => ({
              ...row,
              status: "pending",
              attempts: row.attempts + 1,
              lastError: action.error,
            })),
        toasts: action.error
          ? [
              ...state.toasts,
              { id: crypto.randomUUID(), message: action.error.message },
            ]
          : state.toasts,
      };
    }
    case "outbox/conflict":
      return {
        ...state,
        conflictBanner: {
          gameId: action.gameId,
          clientCommandId: action.clientCommandId,
        },
        byGame: updateRow(state.byGame, action.clientCommandId, () => null),
      };
    case "outbox/banner/dismissed":
      return { ...state, conflictBanner: null };
    case "outbox/drain/started":
      return { ...state, draining: true };
    case "outbox/drain/finished":
      return { ...state, draining: false };
    case "outbox/toast":
      return {
        ...state,
        toasts: [...state.toasts, { id: crypto.randomUUID(), message: action.message }],
      };
    case "outbox/toast/dismiss":
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.id),
      };
    default:
      return state;
  }
}
