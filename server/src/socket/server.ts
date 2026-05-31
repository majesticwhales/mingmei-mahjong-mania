import type { Server as HttpServer } from "node:http";
import {
  Server as SocketIOServer,
  type DefaultEventsMap,
  type Socket,
} from "socket.io";
import { verifyAccessToken } from "../auth/jwt.ts";

/**
 * Per-socket state attached at handshake time and extended by later
 * handlers (chunk 3 adds `lobbyId` / `gameId` / `gameTeamId` so the
 * SocketBroadcaster can fan team-scoped projections out by joined room).
 */
export interface SocketData {
  /** `users.id` — set in the handshake JWT middleware. */
  userId: string;
  /** Set by `game.join` (chunk 3); used by the broadcaster for per-team projections. */
  gameTeamId?: string;
  /** Set by `game.join` (chunk 3); cross-checked when handling `game.command`. */
  gameId?: string;
}

/** Convenience aliases so handler signatures stay short. */
export type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
export type AppSocketServer = SocketIOServer<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

/**
 * Attach a Socket.IO server to the given HTTP server with JWT-authenticated
 * handshake. Returns the `Server` instance so callers can register
 * connection handlers and (in chunk 4) the broadcaster registry can keep
 * a reference for fan-out.
 *
 * Cross-origin is permissive in v1 — the TDD defers stricter CORS until
 * the production deployment surface is decided.
 */
export function createSocketServer(httpServer: HttpServer): AppSocketServer {
  const io: AppSocketServer = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    serveClient: false,
  });
  io.use(jwtHandshakeMiddleware);
  return io;
}

/**
 * Reject the connection with `unauthorized` if the client failed to
 * present a valid JWT in `handshake.auth.token`. On success the
 * verified `sub` (user id) is parked on `socket.data.userId` so
 * downstream handlers can authorize without re-verifying.
 *
 * We always surface the same `unauthorized` message for missing /
 * malformed / expired tokens so clients can't probe for valid user ids
 * via timing or error-message differences.
 */
function jwtHandshakeMiddleware(
  socket: AppSocket,
  next: (err?: Error) => void,
): void {
  const token = readToken(socket);
  if (!token) {
    next(new Error("unauthorized"));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
}

function readToken(socket: AppSocket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  const raw = auth?.token;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
