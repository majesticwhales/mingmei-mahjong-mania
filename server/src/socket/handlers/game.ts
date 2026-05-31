import { HttpError } from "../../lib/http-error.ts";
import { GameParticipant } from "../../models/game-participant.ts";
import {
  buildGameStateProjection,
  type GameStateProjection,
} from "../../projections/game-state.ts";
import { enqueueCommand } from "../../queue/enqueue-command.ts";
import { runQueueTickForGame } from "../../queue/run-tick.ts";
import { getBroadcaster } from "../broadcaster-registry.ts";
import { gameRoom } from "../rooms.ts";
import type { AppSocket } from "../server.ts";
import { type Ack, makeAck, toErrorAck } from "./shared.ts";

export interface GameJoinPayload {
  gameId: string;
}

export type GameJoinResponse = { state: GameStateProjection };
export type GameJoinAck = Ack<GameJoinResponse>;

/**
 * Wire shape of a C→S `game.command` event. `payload` is optional on
 * the wire (some commands take no args) but the server-side parser
 * always normalises to `{}` before handing the value to
 * `enqueueCommand`.
 */
export interface GameCommandPayload {
  gameId: string;
  gameTeamId: string;
  commandType: string;
  payload?: Record<string, unknown>;
  clientCommandId: string;
}

interface ParsedGameCommand {
  gameId: string;
  gameTeamId: string;
  commandType: string;
  payload: Record<string, unknown>;
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
  socket.on("game.command", (payload: unknown) => {
    void handleGameCommand(socket, payload);
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

/**
 * Handle a player command issued over the socket. Chunk 5 deliberately
 * keeps the worker out of scope: the queue is drained inline so the
 * round-trip is exercisable end-to-end in tests without standing up a
 * background loop. Chunk 6 replaces the inline drain with
 * `triggerGameQueue(gameId)` (per-game coalescing + safety-net poll).
 *
 * Flow:
 *   1. Parse payload (rejects malformed ones up-front so the client
 *      gets a useful `invalid_payload` instead of a queue row stuck
 *      in `failed`).
 *   2. Verify the socket is bound to this game/team (chunk 3 set
 *      `socket.data.gameId` / `gameTeamId` on `game.join`). The check
 *      forbids issuing on a team the socket didn't join with — no
 *      enumeration channel and a clear chunk-3 invariant.
 *   3. `enqueueCommand` runs its own validation (game active,
 *      participant on team, command type known, UUID shape) and
 *      handles idempotent retries via the `(game_id, client_command_id)`
 *      unique index.
 *   4. On success, ack the issuer and synchronously drain the queue
 *      using the production registry's broadcaster so any post-commit
 *      `game.event` / `game.state` fan-out arrives on connected
 *      sockets immediately.
 *
 * Any thrown `HttpError` becomes `game.command.rejected` on the issuing
 * socket only; the queue itself remains untouched on rejection.
 */
async function handleGameCommand(
  socket: AppSocket,
  payload: unknown,
): Promise<void> {
  let clientCommandId = extractClientCommandId(payload);
  try {
    const parsed = parseGameCommandPayload(payload);
    clientCommandId = parsed.clientCommandId;

    if (
      socket.data.gameId !== parsed.gameId ||
      socket.data.gameTeamId !== parsed.gameTeamId
    ) {
      throw new HttpError(
        403,
        "forbidden",
        "Socket has not joined this game/team",
      );
    }

    const { item } = await enqueueCommand({
      gameId: parsed.gameId,
      gameTeamId: parsed.gameTeamId,
      userId: socket.data.userId,
      commandType: parsed.commandType,
      payload: parsed.payload,
      clientCommandId: parsed.clientCommandId,
    });

    const ack: GameCommandAcked = {
      clientCommandId: parsed.clientCommandId,
      queueItemId: item.id,
    };
    socket.emit("game.command.acked", ack);

    await runQueueTickForGame(parsed.gameId, {
      broadcaster: getBroadcaster(),
    });
  } catch (err) {
    const errAck = toErrorAck(err);
    const reject: GameCommandRejected = {
      clientCommandId,
      code: errAck.code,
      message: errAck.message,
    };
    socket.emit("game.command.rejected", reject);
  }
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

function parseGameCommandPayload(payload: unknown): ParsedGameCommand {
  if (!isRecord(payload)) {
    throw new HttpError(400, "invalid_payload", "Expected an object payload");
  }
  const gameId = requireNonEmptyString(payload.gameId, "gameId");
  const gameTeamId = requireNonEmptyString(payload.gameTeamId, "gameTeamId");
  const commandType = requireNonEmptyString(
    payload.commandType,
    "commandType",
  );
  const clientCommandId = requireNonEmptyString(
    payload.clientCommandId,
    "clientCommandId",
  );
  const inner = payload.payload;
  if (inner !== undefined && !isRecord(inner)) {
    throw new HttpError(
      400,
      "invalid_payload",
      "payload must be an object when present",
    );
  }
  return {
    gameId,
    gameTeamId,
    commandType,
    payload: (inner ?? {}) as Record<string, unknown>,
    clientCommandId,
  };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      `Missing ${fieldName}`,
    );
  }
  return value;
}

/**
 * Best-effort extraction of `clientCommandId` from a maybe-malformed
 * payload so we can echo it back on a rejection ack. Returns null
 * silently if the payload is shaped wrong; the rejection itself
 * carries the validation error.
 */
function extractClientCommandId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const id = payload.clientCommandId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
