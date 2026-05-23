import type {
  Broadcaster,
  NotificationPayload,
} from "../../src/engine/broadcaster.ts";
import type { GameEvent } from "../../src/models/game-event.ts";

export interface RecordedEvent {
  gameId: string;
  event: GameEvent;
}

export interface RecordedNotification {
  gameId: string;
  notification: NotificationPayload;
}

/**
 * Captures everything pushed at it for later assertion. Lets engine /
 * scheduler tests verify "what would be broadcast" without standing up
 * a Socket.IO server.
 */
export class RecordingBroadcaster implements Broadcaster {
  readonly events: RecordedEvent[] = [];
  readonly stateBroadcasts: string[] = [];
  readonly notifications: RecordedNotification[] = [];

  emitEvent(gameId: string, event: GameEvent): void {
    this.events.push({ gameId, event });
  }

  emitState(gameId: string): void {
    this.stateBroadcasts.push(gameId);
  }

  emitNotification(gameId: string, notification: NotificationPayload): void {
    this.notifications.push({ gameId, notification });
  }
}
