import type { ConnectionAction, ConnectionState } from "./types";

export function connectionReducer(
  state: ConnectionState,
  action: ConnectionAction,
): ConnectionState {
  switch (action.type) {
    case "conn/reset":
      return { status: "idle" };
    case "conn/connect/started":
      return { status: "connecting", attempt: action.attempt };
    case "conn/connect/succeeded":
      return { status: "connected", since: action.at };
    case "conn/disconnect":
      return {
        status: "disconnected",
        reason: action.reason,
        attempt: action.attempt,
      };
    case "conn/reconnect/scheduled":
      return {
        status: "reconnecting",
        attempt: action.attempt,
        nextAttemptAt: action.nextAttemptAt,
      };
    case "conn/give-up":
      return { status: "giving_up", reason: action.reason };
    case "conn/retry-requested":
      return { status: "connecting", attempt: 0 };
    default:
      return state;
  }
}
