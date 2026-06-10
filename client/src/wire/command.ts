// SERVER SOURCE: server/src/socket/handlers/game.ts, routes/games.ts

import type { GameStateProjection } from "./projection";

export type CommandType =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "SWAP_TILE"
  | "SWAP_LOCATION_TILES"
  | "START_CHALLENGE"
  | "CHALLENGE_COMPLETED"
  | "CHALLENGE_FORFEITED"
  | "CLAIM_WIN";

export interface GameCommandPayload {
  gameId: string;
  gameTeamId: string;
  commandType: CommandType | string;
  payload?: Record<string, unknown>;
  clientCommandId: string;
}

export interface GameCommandAcked {
  clientCommandId: string;
  queueItemId: string;
}

export interface GameCommandRejected {
  clientCommandId: string | null;
  code: string;
  message: string;
}

export type SocketAck<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

export interface GameJoinResponse {
  state: GameStateProjection;
  gameTeamId: string;
}

export interface LobbyJoinResponse {
  lobby: import("./lobby").LobbyDetailDto;
}
