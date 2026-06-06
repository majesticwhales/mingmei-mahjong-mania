import type { RecentEventDto } from "../../wire/projection";
import type { GameAction, GameState } from "./types";

const SAFETY_WINDOW = 50;

function mergeEvents(existing: RecentEventDto[], incoming: RecentEventDto[]) {
  const bySequence = new Map(existing.map((event) => [event.sequence, event]));
  for (const event of incoming) {
    bySequence.set(event.sequence, event);
  }
  const merged = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  if (merged.length === 0) return merged;
  const minKeep = merged[merged.length - 1].sequence - SAFETY_WINDOW;
  return merged.filter((event) => event.sequence >= minKeep);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "game/load":
      return { status: "loading", id: action.id };
    case "game/loaded":
      return {
        status: "active",
        id: action.id,
        gameTeamId: action.gameTeamId,
        projection: action.projection,
        eventLog: mergeEvents([], action.projection.recentEvents),
        notifications: [],
      };
    case "game/state":
      if (state.status !== "active") return state;
      return {
        ...state,
        projection: action.projection,
        eventLog: mergeEvents(state.eventLog, action.projection.recentEvents),
      };
    case "game/event":
      if (state.status !== "active") return state;
      return {
        ...state,
        eventLog: mergeEvents(state.eventLog, [action.event]),
      };
    case "game/notification":
      if (state.status !== "active") return state;
      return {
        ...state,
        notifications: [
          ...state.notifications,
          {
            id: crypto.randomUUID(),
            template: action.template,
            data: action.data,
            at: action.at,
          },
        ],
      };
    case "game/notification/dismiss":
      if (state.status !== "active") return state;
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    case "game/load/failed":
      return { status: "error", id: action.id, error: action.error };
    case "game/leave":
      return { status: "absent" };
    default:
      return state;
  }
}
