import { sequelize } from "../config/database.ts";
import { appendEvent } from "../engine/event-log.ts";
import type { Broadcaster } from "../engine/broadcaster.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";
import { runGameEnd } from "../scheduler/handlers/game-end.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";
import { assertIsAdmin } from "./auth-service.ts";

export interface EndGameResult {
  status: "ended";
}

export interface EndGameOptions {
  broadcaster?: Broadcaster;
}

/**
 * End an active game early. Admin-only; idempotent when the game is already
 * ended. Reuses the scheduler GAME_END handler so state transitions and
 * events match the scheduled end path.
 */
export async function endGameEarly(
  gameId: string,
  userId: string,
  options: EndGameOptions = {},
): Promise<EndGameResult> {
  await assertIsAdmin(userId);
  const broadcaster = options.broadcaster ?? getBroadcaster();
  const now = new Date();

  const persisted = await sequelize.transaction(async (transaction) => {
    const game = await Game.findByPk(gameId, { transaction });
    if (!game) {
      throw new HttpError(404, "not_found", "Game not found");
    }
    if (game.status === "ended") {
      return [] as GameEvent[];
    }

    const outcome = await runGameEnd({
      game,
      transaction,
      now,
      trigger: "manual",
    });

    const created: GameEvent[] = [];
    for (const emitted of outcome.events ?? []) {
      const event = await appendEvent(transaction, {
        gameId,
        eventType: emitted.eventType,
        actorUserId: userId,
        actorGameTeamId: null,
        payload: emitted.payload ?? {},
      });
      created.push(event);
    }
    return created;
  });

  for (const event of persisted) {
    await broadcaster.emitEvent(gameId, event);
  }
  if (persisted.length > 0) {
    await broadcaster.emitState(gameId);
  }

  return { status: "ended" };
}
