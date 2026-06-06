import { io, type Socket } from "socket.io-client";
import type {
  GameCommandAcked,
  GameCommandPayload,
  GameCommandRejected,
  GameJoinResponse,
  LobbyJoinResponse,
  SocketAck,
} from "../wire/command";
import type { GameStateProjection } from "../wire/projection";
import type { LobbyDetailDto } from "../wire/lobby";
import type { RecentEventDto } from "../wire/projection";
import { HttpError } from "./httpError";

export type SocketEventMap = {
  "lobby.config": LobbyDetailDto;
  "game.state": GameStateProjection;
  "game.event": RecentEventDto;
  "game.notification": { template: string; data?: Record<string, unknown> };
  "game.command.acked": GameCommandAcked;
  "game.command.rejected": GameCommandRejected;
};

export type SocketStatusListener = (event: string, ...args: unknown[]) => void;

let socket: Socket | null = null;
const pendingCommands = new Map<
  string,
  {
    resolve: (value: GameCommandAcked) => void;
    reject: (error: HttpError) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function unwrapAck<T>(ack: SocketAck<T>): T {
  if (ack.ok) {
    const { ok: _ok, ...data } = ack;
    return data as T;
  }
  throw new HttpError(ack.code, ack.message, 400);
}

export function createSocket(token: string) {
  destroySocket();
  socket = io(window.location.origin, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.4,
    timeout: 10_000,
  });

  socket.on("game.command.acked", (payload: GameCommandAcked) => {
    const pending = pendingCommands.get(payload.clientCommandId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCommands.delete(payload.clientCommandId);
    pending.resolve(payload);
  });

  socket.on("game.command.rejected", (payload: GameCommandRejected) => {
    const id = payload.clientCommandId;
    if (!id) return;
    const pending = pendingCommands.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCommands.delete(id);
    pending.reject(new HttpError(payload.code, payload.message, 400));
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function destroySocket() {
  for (const pending of pendingCommands.values()) {
    clearTimeout(pending.timeout);
    pending.reject(new HttpError("socket_closed", "Socket closed", 0));
  }
  pendingCommands.clear();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function onSocketEvent<K extends keyof SocketEventMap>(
  event: K,
  handler: (payload: SocketEventMap[K]) => void,
) {
  if (!socket) return () => {};
  const wrapped = (...args: unknown[]) => handler(args[0] as SocketEventMap[K]);
  socket.on(event as string, wrapped);
  return () => socket?.off(event as string, wrapped);
}

export function onSocketLifecycle(listener: SocketStatusListener) {
  if (!socket) return () => {};
  const events = [
    "connect",
    "disconnect",
    "connect_error",
    "reconnect_attempt",
    "reconnect_failed",
  ] as const;
  for (const event of events) {
    socket.on(event, (...args: unknown[]) => listener(event, ...args));
  }
  return () => {
    for (const event of events) {
      socket?.off(event);
    }
  };
}

export async function emitLobbyJoin(lobbyId: string) {
  if (!socket) {
    throw new HttpError("socket_unavailable", "Socket not connected", 0);
  }
  return new Promise<LobbyDetailDto>((resolve, reject) => {
    socket!.timeout(10_000).emit(
      "lobby.join",
      { lobbyId },
      (err: Error | null, ack: SocketAck<LobbyJoinResponse>) => {
        if (err) {
          reject(new HttpError("socket_timeout", err.message, 0));
          return;
        }
        try {
          const data = unwrapAck(ack);
          resolve(data.lobby);
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

export async function emitGameJoin(gameId: string) {
  if (!socket) {
    throw new HttpError("socket_unavailable", "Socket not connected", 0);
  }
  return new Promise<GameJoinResponse>((resolve, reject) => {
    socket!.timeout(10_000).emit(
      "game.join",
      { gameId },
      (err: Error | null, ack: SocketAck<GameJoinResponse>) => {
        if (err) {
          reject(new HttpError("socket_timeout", err.message, 0));
          return;
        }
        try {
          resolve(unwrapAck(ack));
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

export function emitCommand(payload: GameCommandPayload, timeoutMs = 10_000) {
  if (!socket) {
    return Promise.reject(new HttpError("socket_unavailable", "Socket not connected", 0));
  }
  return new Promise<GameCommandAcked>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(payload.clientCommandId);
      reject(new HttpError("socket_timeout", "Command ack timed out", 0));
    }, timeoutMs);
    pendingCommands.set(payload.clientCommandId, { resolve, reject, timeout });
    socket!.emit("game.command", payload);
  });
}
