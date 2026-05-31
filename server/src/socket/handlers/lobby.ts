import { HttpError } from "../../lib/http-error.ts";
import {
  getLobbyForUser,
} from "../../services/lobby-service.ts";
import { lobbyRoom } from "../rooms.ts";
import type { AppSocket } from "../server.ts";
import { type Ack, makeAck, toErrorAck } from "./shared.ts";
import type { LobbyDetailDto } from "../../services/lobby-serializer.ts";

export interface LobbyJoinPayload {
  lobbyId: string;
}

export type LobbyJoinResponse = { lobby: LobbyDetailDto };
export type LobbyJoinAck = Ack<LobbyJoinResponse>;

/**
 * Register the `lobby.join` C→S event on the given socket. The handler
 * verifies the connected user is a member of the requested lobby
 * (reusing `getLobbyForUser`, which throws `403 forbidden` for non-
 * members and `404 not_found` for unknown lobbies), joins the
 * `lobbyRoom(lobbyId)` room, and replies via ack with the serialized
 * lobby DTO. The dto matches what the HTTP `GET /api/lobbies/:id`
 * route returns so clients can use one serializer either way.
 *
 * No state mutation here — joining a lobby room is purely socket
 * routing; lobby membership remains driven by the existing REST
 * endpoints.
 */
export function registerLobbyHandlers(socket: AppSocket): void {
  socket.on("lobby.join", (payload: unknown, rawAck: unknown) => {
    const respond = makeAck<LobbyJoinResponse>(rawAck);
    void handleLobbyJoin(socket, payload)
      .then(respond)
      .catch((err: unknown) => respond(toErrorAck(err)));
  });
}

async function handleLobbyJoin(
  socket: AppSocket,
  payload: unknown,
): Promise<LobbyJoinAck> {
  const lobbyId = parseLobbyJoinPayload(payload);
  const lobby = await getLobbyForUser(lobbyId, socket.data.userId);
  await socket.join(lobbyRoom(lobbyId));
  return { ok: true, lobby };
}

function parseLobbyJoinPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new HttpError(400, "invalid_payload", "Expected an object payload");
  }
  const lobbyId = payload.lobbyId;
  if (typeof lobbyId !== "string" || lobbyId.length === 0) {
    throw new HttpError(400, "invalid_payload", "Missing lobbyId");
  }
  return lobbyId;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
