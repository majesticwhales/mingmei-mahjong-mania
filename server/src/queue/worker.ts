import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import type { Broadcaster } from "../engine/broadcaster.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";
import {
  runQueueTickForGame,
  type RunQueueTickForGameOptions,
} from "./run-tick.ts";

export interface QueueWorkerOptions {
  /**
   * Resolves the broadcaster to use for each drain. Defaults to the
   * process-wide registry so production picks up the live
   * `SocketBroadcaster` automatically. Tests can pass a fixed instance.
   */
  resolveBroadcaster?: () => Broadcaster;
  /**
   * Safety-net poll interval in milliseconds. Defaults to 5_000.
   * On each tick we re-trigger every game that still has `pending`
   * commands queued, catching anything an explicit trigger might
   * have missed (e.g. crashes, future multi-instance deployments).
   */
  pollIntervalMs?: number;
  /**
   * Drain primitive. Defaults to {@link runQueueTickForGame}. Tests
   * override this to count invocations without touching the DB.
   */
  drain?: (
    gameId: string,
    options: RunQueueTickForGameOptions,
  ) => Promise<unknown>;
  /**
   * Returns game IDs with pending queue items. Defaults to a
   * `SELECT DISTINCT game_id` query covered by the
   * `game_command_queue_game_status_created` index.
   */
  findPendingGames?: () => Promise<string[]>;
  /**
   * Error sink for drain / poll failures. Defaults to `console.error`.
   * Workers never crash the process on a single bad iteration; we log
   * and continue so the safety-net keeps running.
   */
  onError?: (label: string, err: unknown) => void;
}

interface GameDrainState {
  /** Settles when the current drain loop for this game finishes. */
  inFlight: Promise<void>;
  /** Set to true by `trigger()` calls that arrive while a drain is running. */
  rerun: boolean;
}

/**
 * Background worker that coalesces explicit triggers and runs a
 * safety-net poll for the command queue.
 *
 * Triggers:
 *   - `trigger(gameId)` is synchronous and idempotent. If no drain is
 *     running for the game, it starts one; if one is in-flight, it
 *     marks `rerun = true` so the loop runs again immediately after
 *     the current pass finishes. Callers never await this.
 *
 * Safety-net poll:
 *   - Every `pollIntervalMs` we query `findPendingGames()` and call
 *     `trigger(...)` for each result. This catches enqueues that
 *     happened without an explicit trigger (e.g. another instance in a
 *     future multi-server deployment) and recovers from missed wake-
 *     ups should the trigger pathway ever be bypassed.
 *
 * Shutdown:
 *   - `stop()` clears the poll timer, refuses new triggers, and waits
 *     for every in-flight drain (including any final rerun) to settle
 *     so a SIGTERM never leaves a half-processed command behind.
 *
 * v1 assumption: a single in-process worker per game. The skip-locked
 * claim primitive guarantees at-most-once delivery, but multi-instance
 * deployments will still need per-game advisory locks for strict FIFO.
 */
export class QueueWorker {
  readonly #resolveBroadcaster: () => Broadcaster;
  readonly #pollIntervalMs: number;
  readonly #drain: (
    gameId: string,
    options: RunQueueTickForGameOptions,
  ) => Promise<unknown>;
  readonly #findPendingGames: () => Promise<string[]>;
  readonly #onError: (label: string, err: unknown) => void;

  readonly #states = new Map<string, GameDrainState>();
  #pollTimer: NodeJS.Timeout | null = null;
  #stopped = false;

  constructor(options: QueueWorkerOptions = {}) {
    this.#resolveBroadcaster = options.resolveBroadcaster ?? getBroadcaster;
    this.#pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.#drain = options.drain ?? runQueueTickForGame;
    this.#findPendingGames =
      options.findPendingGames ?? defaultFindPendingGames;
    this.#onError =
      options.onError ??
      ((label, err) => {
        console.error(`[QueueWorker] ${label}`, err);
      });
  }

  /**
   * Signal that `gameId` may have new work. Returns synchronously.
   * If a drain is already in-flight for this game we schedule a rerun
   * so the loop catches the new row without a second concurrent drain.
   */
  trigger(gameId: string): void {
    if (this.#stopped) return;
    const existing = this.#states.get(gameId);
    if (existing) {
      existing.rerun = true;
      return;
    }
    const state: GameDrainState = {
      inFlight: Promise.resolve(),
      rerun: false,
    };
    state.inFlight = this.#runLoop(gameId, state);
    this.#states.set(gameId, state);
  }

  /**
   * Run the safety-net poll a single time. Used by `start()` and by
   * tests that want to exercise the poll without standing up a timer.
   */
  async pollOnce(): Promise<void> {
    if (this.#stopped) return;
    let gameIds: string[];
    try {
      gameIds = await this.#findPendingGames();
    } catch (err) {
      this.#onError("safety-net poll failed", err);
      return;
    }
    for (const id of gameIds) this.trigger(id);
  }

  /**
   * Start the safety-net poll loop. Idempotent; calling twice does not
   * spin up a second timer.
   */
  start(): void {
    if (this.#pollTimer != null || this.#stopped) return;
    this.#scheduleNextPoll();
  }

  /**
   * Wait for the active drain loop for a single game to finish. If no
   * drain is running, returns immediately. Triggers issued while we
   * wait are folded into the same loop via the rerun flag, so this is
   * a true "drain complete" barrier rather than a snapshot.
   */
  async waitForGame(gameId: string): Promise<void> {
    while (true) {
      const state = this.#states.get(gameId);
      if (!state) return;
      await state.inFlight;
      if (this.#states.get(gameId) === state) return;
    }
  }

  /**
   * Wait for every in-flight drain to settle. Re-checks on each pass so
   * new triggers (including rerun fan-out) don't escape the barrier.
   */
  async waitForIdle(): Promise<void> {
    while (this.#states.size > 0) {
      const promises = Array.from(this.#states.values()).map(
        (s) => s.inFlight,
      );
      await Promise.allSettled(promises);
    }
  }

  /**
   * Stop the poll loop, refuse further triggers, and drain everything
   * that is already in-flight. After `stop()` resolves the worker is
   * inert; create a new instance to resume work.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#pollTimer != null) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
    await this.waitForIdle();
  }

  #scheduleNextPoll(): void {
    this.#pollTimer = setTimeout(() => {
      this.#pollTimer = null;
      this.pollOnce().finally(() => {
        if (!this.#stopped) {
          this.#scheduleNextPoll();
        }
      });
    }, this.#pollIntervalMs);
  }

  async #runLoop(gameId: string, state: GameDrainState): Promise<void> {
    try {
      do {
        state.rerun = false;
        try {
          await this.#drain(gameId, {
            broadcaster: this.#resolveBroadcaster(),
          });
        } catch (err) {
          this.#onError(`drain failed for game ${gameId}`, err);
        }
      } while (state.rerun && !this.#stopped);
    } finally {
      // Only remove our own entry; if `stop()` already swept us out
      // (unlikely but possible during shutdown races), do nothing.
      if (this.#states.get(gameId) === state) {
        this.#states.delete(gameId);
      }
    }
  }
}

/**
 * Default safety-net query. Returns distinct game IDs that currently
 * have at least one `pending` queue item. Uses raw SQL to keep the
 * read cheap and explicit about the indexed predicate.
 */
async function defaultFindPendingGames(): Promise<string[]> {
  const rows = await sequelize.query<{ game_id: string }>(
    "SELECT DISTINCT game_id FROM game_command_queue WHERE status = 'pending'",
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.game_id);
}

// ---------------------------------------------------------------------------
// Process-singleton registry. Mirrors the broadcaster registry so the socket
// handler can `triggerGameQueue(gameId)` without threading the worker through
// every layer. Tests call `setQueueWorker` in `beforeEach` and
// `setQueueWorker(null)` in `afterEach` to keep state clean.
// ---------------------------------------------------------------------------

let active: QueueWorker | null = null;

export function setQueueWorker(worker: QueueWorker | null): void {
  active = worker;
}

export function getQueueWorker(): QueueWorker | null {
  return active;
}

/**
 * Trigger a drain for `gameId` against the registered worker, if any.
 * Returns synchronously. A no-op when no worker is registered (e.g.
 * unit-test contexts that bypass Phase E entirely) — the underlying
 * row remains in the queue and will be picked up by the next poll or
 * trigger that does have a worker.
 */
export function triggerGameQueue(gameId: string): void {
  active?.trigger(gameId);
}
