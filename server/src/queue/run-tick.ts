import { sequelize } from "../config/database.ts";
import { type Broadcaster, noopBroadcaster } from "../engine/broadcaster.ts";
import { processCommand } from "../engine/process-command.ts";
import type { CommandType } from "../engine/types.ts";
import { GameCommandQueueItem } from "../models/game-command-queue-item.ts";
import { claimNextQueueItem } from "./claim-next-queue-item.ts";

export interface RunQueueTickForGameOptions {
  /** Defaults to the no-op broadcaster. Phase E plugs in the Socket.IO impl. */
  broadcaster?: Broadcaster;
  /**
   * Safety cap on items processed per tick. Default 100. Prevents one
   * runaway game from monopolising the loop forever.
   */
  maxItems?: number;
}

export interface QueueTickResult {
  /** Number of items that terminated with `status = 'done'`. */
  processed: number;
  /** Number of items that terminated with `status = 'failed'`. */
  failed: number;
}

/**
 * Drain pending commands for a single game, in FIFO order.
 *
 * For each item:
 *   1. Claim atomically (own transaction). Row flips to `processing`.
 *   2. Dispatch through {@link processCommand}, which opens its own
 *      transaction to apply state mutations + append events, and then
 *      fires broadcaster events post-commit.
 *   3. Mark `done` (or `failed` + `errorMessage` if step 2 threw) with
 *      `processedAt = now` in a final transaction.
 *
 * Failures don't poison the queue — the row terminates and the loop
 * moves on to the next item. Events from successful items are broadcast
 * by `processCommand` itself; failed items emit nothing on the wire.
 *
 * v1 assumption: callers serialize this per game (one in-process worker
 * per game). Multiple parallel workers for the same game would maintain
 * the at-most-once guarantee but could process commands out of order.
 */
export async function runQueueTickForGame(
  gameId: string,
  options: RunQueueTickForGameOptions = {},
): Promise<QueueTickResult> {
  const broadcaster = options.broadcaster ?? noopBroadcaster;
  const maxItems = options.maxItems ?? 100;

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < maxItems; i += 1) {
    const claimed = await sequelize.transaction((t) =>
      claimNextQueueItem(gameId, t),
    );
    if (claimed == null) {
      break;
    }

    const now = new Date();
    try {
      await processCommand(
        {
          gameId: claimed.gameId,
          gameTeamId: claimed.gameTeamId,
          userId: claimed.userId,
          commandType: claimed.commandType as CommandType,
          payload: claimed.payload,
        },
        { broadcaster },
      );
      await GameCommandQueueItem.update(
        { status: "done", processedAt: now, errorMessage: null },
        { where: { id: claimed.id } },
      );
      processed += 1;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await GameCommandQueueItem.update(
        { status: "failed", processedAt: now, errorMessage },
        { where: { id: claimed.id } },
      );
      failed += 1;
    }
  }

  return { processed, failed };
}
