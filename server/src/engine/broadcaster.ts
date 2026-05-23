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
 * Sink for realtime broadcasts emitted by the engine and scheduler.
 *
 * Phase D ships only a no-op implementation. Phase E will plug in a
 * Socket.IO-backed broadcaster that fans out to `game:{gameId}` rooms.
 *
 * `emitState(gameId)` is a "state changed for this game" signal — the
 * Socket.IO impl will re-build per-team `game.state` projections in
 * response. Phase D does not compute projections.
 */
export interface Broadcaster {
  emitEvent(gameId: string, event: GameEvent): Promise<void> | void;
  emitState(gameId: string): Promise<void> | void;
  emitNotification(
    gameId: string,
    notification: NotificationPayload,
  ): Promise<void> | void;
}

export const noopBroadcaster: Broadcaster = {
  emitEvent: () => {},
  emitState: () => {},
  emitNotification: () => {},
};
