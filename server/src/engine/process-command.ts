import type { Transaction } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { appendEvent } from "./event-log.ts";
import { type Broadcaster, noopBroadcaster } from "./broadcaster.ts";
import { builtinCommandHandlers } from "./handlers/index.ts";
import type { CommandType, EventType } from "./types.ts";

export interface ProcessCommandInput {
  gameId: string;
  gameTeamId: string;
  userId: string;
  commandType: CommandType;
  payload: Record<string, unknown>;
}

export interface CommandContext {
  transaction: Transaction;
  game: Game;
  gameId: string;
  gameTeamId: string;
  userId: string;
  payload: Record<string, unknown>;
}

/**
 * What a handler produces. Handlers focus on what happened; the orchestrator
 * stamps `actorUserId` / `actorGameTeamId` from the originating command when
 * appending events.
 */
export interface EmittedEvent {
  eventType: EventType;
  payload?: Record<string, unknown>;
}

export interface CommandResult {
  events: EmittedEvent[];
}

export interface CommandHandler {
  handle(ctx: CommandContext): Promise<CommandResult>;
}

export interface ProcessCommandOptions {
  broadcaster?: Broadcaster;
  handlers?: ReadonlyMap<CommandType, CommandHandler>;
}

export interface ProcessCommandResult {
  events: GameEvent[];
}

/**
 * Default command handler registry. Re-exports the built-in handlers so
 * callers can rely on a single canonical map without importing each handler
 * individually. Tests may pass their own map via `processCommand` options.
 */
export const defaultCommandHandlers: ReadonlyMap<CommandType, CommandHandler> =
  builtinCommandHandlers;

/**
 * Orchestrate a single command: load game, authorize the user, dispatch to
 * the handler, append events with actor metadata, broadcast post-commit.
 *
 * All DB writes (state mutations + events) happen in one transaction; the
 * broadcaster is invoked only after the transaction commits so consumers
 * never observe an event that has been rolled back.
 */
export async function processCommand(
  input: ProcessCommandInput,
  options: ProcessCommandOptions = {},
): Promise<ProcessCommandResult> {
  const broadcaster = options.broadcaster ?? noopBroadcaster;
  const handlers = options.handlers ?? defaultCommandHandlers;

  const handler = handlers.get(input.commandType);
  if (!handler) {
    throw new HttpError(
      400,
      "unknown_command",
      `Unknown command type: ${input.commandType}`,
    );
  }

  const persisted = await sequelize.transaction(async (transaction) => {
    const game = await Game.findByPk(input.gameId, { transaction });
    if (!game) {
      throw new HttpError(404, "not_found", `Game not found: ${input.gameId}`);
    }
    if (game.status !== "active") {
      throw new HttpError(
        409,
        "game_not_active",
        `Game is ${game.status}; commands are not accepted`,
      );
    }

    const participant = await GameParticipant.findOne({
      where: {
        gameId: input.gameId,
        gameTeamId: input.gameTeamId,
        userId: input.userId,
      },
      transaction,
    });
    if (!participant) {
      throw new HttpError(
        403,
        "forbidden",
        "User is not a participant on the specified team",
      );
    }

    const result = await handler.handle({
      transaction,
      game,
      gameId: input.gameId,
      gameTeamId: input.gameTeamId,
      userId: input.userId,
      payload: input.payload,
    });

    const created: GameEvent[] = [];
    for (const emitted of result.events) {
      const event = await appendEvent(transaction, {
        gameId: input.gameId,
        eventType: emitted.eventType,
        actorUserId: input.userId,
        actorGameTeamId: input.gameTeamId,
        payload: emitted.payload ?? {},
      });
      created.push(event);
    }
    return created;
  });

  for (const event of persisted) {
    await broadcaster.emitEvent(input.gameId, event);
  }
  await broadcaster.emitState(input.gameId);

  return { events: persisted };
}
