import { runSchedulerTick, type SchedulerTickResult } from "./run-tick.ts";

export interface SchedulerWorkerOptions {
  /**
   * How often to run a tick when idle, in milliseconds. Defaults to
   * 1_000 — the scheduler needs a roughly second-level cadence to
   * deliver `VISIBILITY_PHASE_ADVANCE` / `SLOT_UNLOCKED` jobs close
   * to their `run_at` without burning CPU.
   */
  pollIntervalMs?: number;
  /**
   * Tick primitive. Defaults to {@link runSchedulerTick}. Tests
   * override this to count invocations or to simulate failures.
   */
  tick?: () => Promise<SchedulerTickResult | unknown>;
  /**
   * Error sink. Defaults to `console.error`. Errors thrown by a tick
   * never crash the loop; we log and re-schedule.
   */
  onError?: (err: unknown) => void;
}

/**
 * Background worker that drains scheduled jobs on a fixed cadence.
 *
 * Each iteration calls {@link runSchedulerTick} (or the test override)
 * which itself processes up to `maxJobsPerTick` due jobs in FIFO order.
 * The loop never overlaps with itself: the next tick is only scheduled
 * after the current one settles, so a slow tick can't pile up.
 *
 * Compared to {@link QueueWorker}, there is no per-game coalescing
 * here — the scheduler tick is global by design (it claims any due
 * job for any game in one pass) and we rely on `pollIntervalMs` for
 * cadence rather than wakeup triggers. `triggerNow()` is still exposed
 * for callers that want to run a tick immediately (e.g. right after
 * enqueueing a job that should fire ASAP), folded into the loop so it
 * never races with the periodic tick.
 */
export class SchedulerWorker {
  readonly #pollIntervalMs: number;
  readonly #tick: () => Promise<SchedulerTickResult | unknown>;
  readonly #onError: (err: unknown) => void;

  #pollTimer: NodeJS.Timeout | null = null;
  #inFlight: Promise<unknown> = Promise.resolve();
  #pendingTrigger = false;
  #stopped = false;

  constructor(options: SchedulerWorkerOptions = {}) {
    this.#pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.#tick = options.tick ?? runSchedulerTick;
    this.#onError =
      options.onError ??
      ((err) => {
        console.error("[SchedulerWorker] tick failed", err);
      });
  }

  /**
   * Begin the periodic poll loop. Idempotent.
   */
  start(): void {
    if (this.#pollTimer != null || this.#stopped) return;
    this.#scheduleNextPoll();
  }

  /**
   * Run a tick as soon as the current one (if any) settles. Returns a
   * promise that resolves after the resulting tick finishes. Multiple
   * concurrent `triggerNow()` calls coalesce into a single follow-up
   * tick — the second caller observes the same downstream completion
   * as the first.
   */
  triggerNow(): Promise<unknown> {
    if (this.#stopped) return this.#inFlight;
    if (this.#pendingTrigger) return this.#inFlight;
    this.#pendingTrigger = true;
    const next = this.#inFlight.then(async () => {
      if (this.#stopped) return;
      this.#pendingTrigger = false;
      await this.#runOne();
    });
    this.#inFlight = next;
    return next;
  }

  /**
   * Stop scheduling and wait for any in-flight tick to settle. After
   * `stop()` the worker is inert.
   */
  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#pollTimer != null) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }
    await this.#inFlight;
  }

  /**
   * Returns when every tick that has been scheduled or kicked off so
   * far has settled. Used by tests to assert side effects after
   * `triggerNow()` without races.
   */
  async waitForIdle(): Promise<void> {
    await this.#inFlight;
  }

  #scheduleNextPoll(): void {
    this.#pollTimer = setTimeout(() => {
      this.#pollTimer = null;
      if (this.#stopped) return;
      const next = this.#inFlight.then(async () => {
        if (this.#stopped) return;
        await this.#runOne();
      });
      this.#inFlight = next;
      next.finally(() => {
        if (!this.#stopped) {
          this.#scheduleNextPoll();
        }
      });
    }, this.#pollIntervalMs);
  }

  async #runOne(): Promise<void> {
    try {
      await this.#tick();
    } catch (err) {
      this.#onError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Process-singleton registry. Symmetric with `queue/worker.ts`. Callers that
// need to trigger a tick (e.g. right after enqueueing a near-future job) can
// reach the registered worker without plumbing it through.
// ---------------------------------------------------------------------------

let active: SchedulerWorker | null = null;

export function setSchedulerWorker(worker: SchedulerWorker | null): void {
  active = worker;
}

export function getSchedulerWorker(): SchedulerWorker | null {
  return active;
}

/**
 * Trigger a scheduler tick against the registered worker, if any.
 * No-op when no worker is registered (e.g. unit-test contexts).
 */
export function triggerSchedulerNow(): void {
  active?.triggerNow();
}
