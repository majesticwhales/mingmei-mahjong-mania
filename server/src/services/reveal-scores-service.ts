import { sequelize } from "../config/database.ts";
import { appendEvent } from "../engine/event-log.ts";
import type { Broadcaster } from "../engine/broadcaster.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";
import { assertIsAdmin } from "./auth-service.ts";

export interface RevealScoresResult {
  status: "ended";
}

export interface RevealScoresOptions {
  broadcaster?: Broadcaster;
}

/**
 * Admin-only: advance a game from the post-timer wrap-up window
 * (`ending`) to the public scoreboard phase (`ended`). Idempotent when
 * scores were already revealed.
 */
export async function revealGameScores(
  gameId: string,
  userId: string,
  options: RevealScoresOptions = {},
): Promise<RevealScoresResult> {
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
    if (game.status !== "ending") {
      throw new HttpError(
        409,
        "game_not_in_wrap_up",
        `Game ${gameId} is not waiting for score reveal (status: ${game.status})`,
      );
    }

    game.status = "ended";
    await game.save({ transaction });

    const event = await appendEvent(transaction, {
      gameId,
      eventType: "SCORES_REVEALED",
      actorUserId: userId,
      actorGameTeamId: null,
      payload: { revealedAt: now.toISOString() },
    });
    return [event];
  });

  for (const event of persisted) {
    await broadcaster.emitEvent(gameId, event);
  }
  if (persisted.length > 0) {
    await broadcaster.emitState(gameId);
  }

  return { status: "ended" };
}
