import type { HttpError } from "../../transport/httpError";
import type { GameStateProjection, RecentEventDto } from "../../wire/projection";

export interface GameNotificationToast {
  id: string;
  template: string;
  data?: Record<string, unknown>;
  at: string;
}

export type GameState =
  | { status: "absent" }
  | { status: "loading"; id: string }
  | {
      status: "active";
      id: string;
      gameTeamId: string;
      projection: GameStateProjection;
      eventLog: RecentEventDto[];
      notifications: GameNotificationToast[];
    }
  | { status: "error"; id: string; error: HttpError };

export type GameAction =
  | { type: "game/load"; id: string }
  | { type: "game/loaded"; id: string; gameTeamId: string; projection: GameStateProjection }
  | { type: "game/resynced"; gameTeamId: string; projection: GameStateProjection }
  | { type: "game/state"; projection: GameStateProjection }
  | { type: "game/event"; event: RecentEventDto }
  | { type: "game/notification"; template: string; data?: Record<string, unknown>; at: string }
  | { type: "game/notification/dismiss"; id: string }
  | { type: "game/load/failed"; id: string; error: HttpError }
  | { type: "game/leave" };
