import { HttpError } from "../../lib/http-error.ts";
import { GameParticipant } from "../../models/game-participant.ts";
import {
  buildGameStateProjection,
  type GameStateProjection,
} from "../../projections/game-state.ts";
import { gameRoom } from "../rooms.ts";
import type { AppSocket } from "../server.ts";
import { type Ack, makeAck, toErrorAck } from "./shared.ts";

export interface GameJoinPayload {
  gameId: string;
}

export type GameJoinResponse = { state: GameStateProjection };
export type GameJoinAck = Ack<GameJoinResponse>;

/**
 * Register the `game.join` C→S event on the given socket.
 *
 * Looks up the connected user's `game_participants` row for the
 * requested game (one row per user per game; carries the user's
 * `game_team_id`). Non-participants are rejected with `403 forbidden`
 * so the response is identical for "game does not exist" and "user
 * is on a different game" — no enumeration channel.
 *
 * On success, the team id is parked on `socket.data.gameTeamId` (and
 * the game id on `socket.data.gameId`) so the chunk-4 SocketBroadcaster
 * can fan team-scoped projections out without re-querying, and chunk 5
 * can cross-check the `game.command` authz against the joined game.
 *
 * The initial `game.state` projection is returned via the ack so the
 * join handler is testable end-to-end without depending on the
 * broadcaster — same wire shape `game.state` events will use later.
 */
export function registerGameHandlers(socket: AppSocket): void {
  socket.on("game.join", (payload: unknown, rawAck: unknown) => {
    const respond = makeAck<GameJoinResponse>(rawAck);
    void handleGameJoin(socket, payload)
      .then(respond)
      .catch((err: unknown) => respond(toErrorAck(err)));
  });
}

async function handleGameJoin(
  socket: AppSocket,
  payload: unknown,
): Promise<GameJoinAck> {
  const gameId = parseGameJoinPayload(payload);

  const participant = await GameParticipant.findOne({
    where: { gameId, userId: socket.data.userId },
  });
  if (!participant) {
    throw new HttpError(
      403,
      "forbidden",
      "Not a participant of this game",
    );
  }

  socket.data.gameId = gameId;
  socket.data.gameTeamId = participant.gameTeamId;
  await socket.join(gameRoom(gameId));

  const state = await buildGameStateProjection(gameId, participant.gameTeamId);
  return { ok: true, state };
}

function parseGameJoinPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new HttpError(400, "invalid_payload", "Expected an object payload");
  }
  const gameId = payload.gameId;
  if (typeof gameId !== "string" || gameId.length === 0) {
    throw new HttpError(400, "invalid_payload", "Missing gameId");
  }
  return gameId;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
