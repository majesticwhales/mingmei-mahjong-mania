import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";

export interface AppendEventInput {
  gameId: string;
  eventType: string;
  actorUserId?: string | null;
  actorGameTeamId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Append a single event to `game_events`, allocating the next monotonic
 * sequence number for the game.
 *
 * Serializes writers per game by taking a row-level lock on the `games`
 * row and computing `MAX(sequence) + 1` within the caller's transaction.
 * Concurrent appends to the same game block on the `FOR UPDATE` lock;
 * multiple appends inside the same transaction see strictly increasing
 * sequence values (Postgres read-your-own-writes).
 *
 * Assumes the caller's transaction runs at READ COMMITTED isolation
 * (Sequelize's Postgres default). The `(game_id, sequence)` unique index
 * on `game_events` is the safety net if anything bypasses this writer.
 *
 * `sequence` is returned as a string because the underlying column is
 * `BIGINT`; `GameEvent.sequence` is typed `string` for the same reason.
 */
export async function appendEvent(
  transaction: Transaction,
  input: AppendEventInput,
): Promise<GameEvent> {
  const game = await Game.findByPk(input.gameId, {
    lock: Transaction.LOCK.UPDATE,
    transaction,
  });

  if (!game) {
    throw new HttpError(404, "not_found", `Game not found: ${input.gameId}`);
  }

  const rows = await sequelize.query<{ next_sequence: string }>(
    `SELECT COALESCE(MAX(sequence), 0)::bigint + 1 AS next_sequence
     FROM game_events
     WHERE game_id = :gameId`,
    {
      replacements: { gameId: input.gameId },
      transaction,
      type: QueryTypes.SELECT,
    },
  );

  const nextSequence = rows[0]?.next_sequence ?? "1";

  return await GameEvent.create(
    {
      gameId: input.gameId,
      sequence: nextSequence,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      actorGameTeamId: input.actorGameTeamId ?? null,
      payload: input.payload ?? {},
    },
    { transaction },
  );
}
