import { UniqueConstraintError } from "sequelize";
import { isCommandType, type CommandType } from "../engine/types.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameCommandQueueItem } from "../models/game-command-queue-item.ts";
import { GameParticipant } from "../models/game-participant.ts";

export interface EnqueueCommandInput {
  gameId: string;
  gameTeamId: string;
  userId: string;
  commandType: CommandType | string;
  payload: Record<string, unknown>;
  /** Caller-generated UUID; unique per `(game_id, client_command_id)`. */
  clientCommandId: string;
}

export interface EnqueueCommandResult {
  item: GameCommandQueueItem;
  /**
   * `fresh` when the row was newly inserted; `duplicate` when an earlier
   * call with the same `client_command_id` already inserted it. Idempotent
   * retries replay the original row rather than producing a 409.
   */
  status: "fresh" | "duplicate";
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-empty string`,
    );
  }
  return value;
}

function assertUuid(value: unknown, fieldName: string): string {
  const s = assertString(value, fieldName);
  if (!UUID_REGEX.test(s)) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a UUID`,
    );
  }
  return s;
}

function payloadsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Insert a player command into `game_command_queue` for later processing.
 *
 * Authorization mirrors {@link import("../engine/process-command.ts").processCommand}:
 * the game must be `active`, the user must be a participant on the supplied
 * team, and the command type must be known. We re-check at enqueue so a
 * bad request fails fast (rather than turning into a `failed` queue row
 * the operator has to clean up) — the processor re-validates anyway.
 *
 * Idempotency: the `(game_id, client_command_id)` unique index guarantees
 * at most one row per logical command. A retry with the same id replays
 * the existing row when it matches, and rejects with
 * `client_command_id_conflict` when a mismatched row already exists
 * (different user/team/type/payload — practically impossible with random
 * UUIDs, but cheap to detect and avoids subtle bugs).
 */
export async function enqueueCommand(
  input: EnqueueCommandInput,
): Promise<EnqueueCommandResult> {
  const gameId = assertUuid(input.gameId, "gameId");
  const gameTeamId = assertUuid(input.gameTeamId, "gameTeamId");
  const userId = assertUuid(input.userId, "userId");
  const clientCommandId = assertUuid(input.clientCommandId, "clientCommandId");
  if (!isCommandType(input.commandType)) {
    throw new HttpError(
      400,
      "unknown_command",
      `Unknown command type: ${input.commandType}`,
    );
  }
  const commandType: CommandType = input.commandType;
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(
      400,
      "validation_error",
      "payload must be an object",
    );
  }

  const game = await Game.findByPk(gameId);
  if (!game) {
    throw new HttpError(404, "not_found", `Game not found: ${gameId}`);
  }
  if (game.status !== "active") {
    throw new HttpError(
      409,
      "game_not_active",
      `Game is ${game.status}; commands are not accepted`,
    );
  }

  const participant = await GameParticipant.findOne({
    where: { gameId, gameTeamId, userId },
  });
  if (!participant) {
    throw new HttpError(
      403,
      "forbidden",
      "User is not a participant on the specified team",
    );
  }

  try {
    const item = await GameCommandQueueItem.create({
      gameId,
      gameTeamId,
      userId,
      commandType,
      payload,
      clientCommandId,
      status: "pending",
    });
    return { item, status: "fresh" };
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) {
      throw err;
    }
    const existing = await GameCommandQueueItem.findOne({
      where: { gameId, clientCommandId },
    });
    if (!existing) {
      throw err;
    }
    if (
      existing.userId !== userId ||
      existing.gameTeamId !== gameTeamId ||
      existing.commandType !== commandType ||
      !payloadsEqual(existing.payload, payload)
    ) {
      throw new HttpError(
        409,
        "client_command_id_conflict",
        "clientCommandId already used with a different command",
      );
    }
    return { item: existing, status: "duplicate" };
  }
}
