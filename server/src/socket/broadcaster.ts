import type {
  Broadcaster,
  NotificationPayload,
} from "../engine/broadcaster.ts";
import type { GameEvent } from "../models/game-event.ts";
import { buildGameStateProjection } from "../projections/game-state.ts";
import { serializeGameEvent } from "../projections/recent-events.ts";
import { getLobbyDetail } from "../services/lobby-service.ts";
import { gameRoom, lobbyRoom } from "./rooms.ts";
import type { AppSocketServer } from "./server.ts";

export interface SocketBroadcasterOptions {
  /**
   * Wall-clock provider used by `emitState` when pinning the `now`
   * passed into each team's projection. Defaults to `() => new Date()`.
   * Tests inject a fixed clock when they need deterministic per-slot
   * unlock state across a fan-out.
   */
  now?: () => Date;
}

/**
 * `Broadcaster` implementation that fans realtime updates out over a
 * Socket.IO `Server`. Replaces the no-op default in `process-command`
 * and `scheduler/run-tick` once chunks 4+ wire it in via the registry.
 *
 * Three responsibilities (TDD §6):
 *   - `emitEvent` — append-style log entries broadcast verbatim to
 *     every socket in `game:{gameId}`. Wire shape matches
 *     `game.state.recentEvents[]` so clients can extend their local
 *     history without massaging the payload.
 *   - `emitNotification` — opaque `{ template, data? }` template
 *     instances broadcast to the game room. The template catalog
 *     itself is a rule-layer concern.
 *   - `emitState` — fan out a *team-scoped* `game.state` projection.
 *     We pin a single `now` so every team's projection sees the same
 *     wall clock (matters when a slot unlock boundary lies inside the
 *     fan-out window), group connected sockets by joined team, build
 *     one projection per team, and emit it to each member socket of
 *     that team. Sockets that joined the game room without a team
 *     (e.g. mid-handshake, or a spectator path we haven't built) are
 *     silently skipped — they're not a valid v1 state.
 */
export class SocketBroadcaster implements Broadcaster {
  private readonly nowFn: () => Date;

  constructor(
    private readonly io: AppSocketServer,
    options: SocketBroadcasterOptions = {},
  ) {
    this.nowFn = options.now ?? (() => new Date());
  }

  async emitEvent(gameId: string, event: GameEvent): Promise<void> {
    const dto = await serializeGameEvent(event);
    this.io.to(gameRoom(gameId)).emit("game.event", dto);
  }

  emitNotification(gameId: string, payload: NotificationPayload): void {
    this.io.to(gameRoom(gameId)).emit("game.notification", payload);
  }

  async emitState(gameId: string): Promise<void> {
    const sockets = await this.io.in(gameRoom(gameId)).fetchSockets();
    if (sockets.length === 0) {
      return;
    }

    const socketsByTeam = new Map<string, typeof sockets>();
    for (const socket of sockets) {
      const gameTeamId = socket.data.gameTeamId;
      if (!gameTeamId) continue;
      const list = socketsByTeam.get(gameTeamId) ?? [];
      list.push(socket);
      socketsByTeam.set(gameTeamId, list);
    }
    if (socketsByTeam.size === 0) {
      return;
    }

    const now = this.nowFn();
    for (const [gameTeamId, members] of socketsByTeam) {
      const projection = await buildGameStateProjection(gameId, gameTeamId, {
        now,
      });
      for (const member of members) {
        member.emit("game.state", projection);
      }
    }
  }

  /**
   * Re-broadcast the lobby detail DTO to every socket in
   * `lobby:{lobbyId}`. Unlike `emitState`, this DTO is identical for
   * all viewers (membership gating happens at `lobby.join` time), so
   * we build it once and fan it out with a single room emit.
   *
   * Skips the DB read entirely when no one is listening — broadcast
   * targets in this layer are pure side effects on REST mutations, so
   * paying for a `getLobbyDetail` query when no socket is in the room
   * is just deadweight.
   */
  async emitLobbyConfig(lobbyId: string): Promise<void> {
    const sockets = await this.io.in(lobbyRoom(lobbyId)).fetchSockets();
    if (sockets.length === 0) return;
    const dto = await getLobbyDetail(lobbyId);
    this.io.to(lobbyRoom(lobbyId)).emit("lobby.config", dto);
  }
}
