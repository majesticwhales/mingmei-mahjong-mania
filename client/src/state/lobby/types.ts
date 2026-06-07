import type { HttpError } from "../../transport/httpError";
import type { LobbyDetailDto } from "../../wire/lobby";

export type LobbyState =
  | { status: "absent" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; lobby: LobbyDetailDto; previousTeamSlot?: number | null }
  | { status: "error"; id: string; error: HttpError };

export type LobbyAction =
  | { type: "lobby/load"; id: string }
  | { type: "lobby/loaded"; id: string; lobby: LobbyDetailDto }
  | { type: "lobby/updated"; lobby: LobbyDetailDto }
  | { type: "lobby/load/failed"; id: string; error: HttpError }
  | { type: "lobby/leave"; id: string }
  | { type: "lobby/team/optimistic"; userId: string; teamSlot: number | null; previousTeamSlot: number | null }
  | { type: "lobby/team/rolled-back"; userId: string };
