import type { GameEvent } from "../models/game-event.ts";

/**
 * Static notification template payload broadcast to a game room.
 * `template` identifies the message (looked up client-side or server-side
 * in Phase E); `data` is template-specific interpolation context.
 */
export interface NotificationPayload {
  template: string;
  data?: Record<string, unknown>;
}

/**
 * Sink for realtime broadcasts emitted by the engine, scheduler, and
 * lobby services.
 *
 * Phase D ships only a no-op implementation. Phase E plugs in a
 * Socket.IO-backed broadcaster that fans out to `game:{gameId}` and
 * `lobby:{lobbyId}` rooms.
 *
 * Signals (rather than full payloads) for the room-wide state events
 * (`emitState`, `emitLobbyConfig`) — the live impl re-builds the
 * projection / DTO on demand so the broadcaster owns the source of
 * truth for what subscribers should see. The no-op default makes it
 * safe to call these from anywhere without booting Socket.IO (unit
 * tests, the seed runner, migrations).
 */
export interface Broadcaster {
  emitEvent(gameId: string, event: GameEvent): Promise<void> | void;
  emitState(gameId: string): Promise<void> | void;
  emitNotification(
    gameId: string,
    notification: NotificationPayload,
  ): Promise<void> | void;
  /**
   * Re-broadcast the lobby's current detail DTO to every socket in
   * `lobby:{lobbyId}`. Called from REST mutations on the lobby
   * (`updateConfig`, `joinLobby`, `pickTeam`) and from the notification
   * CRUD endpoints so connected clients see the same source of truth
   * the HTTP responder just returned.
   */
  emitLobbyConfig(lobbyId: string): Promise<void> | void;
}

export const noopBroadcaster: Broadcaster = {
  emitEvent: () => {},
  emitState: () => {},
  emitNotification: () => {},
  emitLobbyConfig: () => {},
};
