import { afterEach, describe, expect, it, vi } from "vitest";
import { SchedulerWorker } from "../../../src/scheduler/worker.ts";

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("SchedulerWorker", () => {
  let worker: SchedulerWorker | null = null;

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
  });

  it("start runs ticks on the configured cadence", async () => {
    const tick = vi.fn(async () => undefined);
    worker = new SchedulerWorker({ tick, pollIntervalMs: 10 });
    worker.start();

    await new Promise((r) => setTimeout(r, 55));
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("never overlaps ticks: a slow tick delays the next one rather than running in parallel", async () => {
    let active = 0;
    let maxActive = 0;
    const tick = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
    });
    worker = new SchedulerWorker({ tick, pollIntervalMs: 1 });
    worker.start();

    await new Promise((r) => setTimeout(r, 60));
    expect(maxActive).toBe(1);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("triggerNow runs a tick right after the in-flight one settles", async () => {
    const gate = deferred<void>();
    let firstStarted = false;
    let firstFinished = false;
    const calls: string[] = [];
    const tick = vi.fn(async () => {
      const id = `t${calls.length + 1}`;
      calls.push(id);
      if (!firstStarted) {
        firstStarted = true;
        await gate.promise;
        firstFinished = true;
      }
    });
    worker = new SchedulerWorker({ tick, pollIntervalMs: 60_000 });
    worker.start();

    // Wait for the first tick to start (poll fires after pollIntervalMs).
    // We use a tiny pollIntervalMs to make the first tick fire quickly in
    // a separate variant; here we want to drive ticks ourselves so we
    // skip waiting for the periodic loop and just call triggerNow twice.
    const t1 = worker.triggerNow();
    while (!firstStarted) await new Promise((r) => setTimeout(r, 1));
    const t2 = worker.triggerNow();

    // The second triggerNow shouldn't have run yet — the first tick is
    // still parked on the gate.
    await new Promise((r) => setTimeout(r, 15));
    expect(firstFinished).toBe(false);
    expect(calls).toEqual(["t1"]);

    gate.resolve();
    await Promise.all([t1, t2]);
    expect(firstFinished).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("coalesces concurrent triggerNow calls into a single follow-up tick", async () => {
    const gate = deferred<void>();
    let firstStarted = false;
    const tick = vi.fn(async () => {
      if (!firstStarted) {
        firstStarted = true;
        await gate.promise;
      }
    });
    worker = new SchedulerWorker({ tick, pollIntervalMs: 60_000 });

    const t1 = worker.triggerNow();
    while (!firstStarted) await new Promise((r) => setTimeout(r, 1));
    const t2 = worker.triggerNow();
    const t3 = worker.triggerNow();
    const t4 = worker.triggerNow();

    gate.resolve();
    await Promise.all([t1, t2, t3, t4]);
    // First tick + exactly one coalesced follow-up = 2 calls total.
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("isolates tick failures: future ticks still run", async () => {
    const errors: unknown[] = [];
    let shouldFail = true;
    const tick = vi.fn(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("scheduler boom");
      }
    });
    worker = new SchedulerWorker({
      tick,
      pollIntervalMs: 5,
      onError: (err) => errors.push(err),
    });
    worker.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(errors).toHaveLength(1);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("stop waits for the in-flight tick to settle", async () => {
    const gate = deferred<void>();
    let inTick = false;
    let tickFinished = false;
    const tick = vi.fn(async () => {
      inTick = true;
      await gate.promise;
      tickFinished = true;
    });
    worker = new SchedulerWorker({ tick, pollIntervalMs: 5 });
    worker.start();
    while (!inTick) await new Promise((r) => setTimeout(r, 1));

    let stopResolved = false;
    const stopPromise = worker.stop().then(() => {
      stopResolved = true;
    });
    await new Promise((r) => setTimeout(r, 25));
    expect(stopResolved).toBe(false);
    expect(tickFinished).toBe(false);

    gate.resolve();
    await stopPromise;
    expect(stopResolved).toBe(true);
    expect(tickFinished).toBe(true);
    worker = null;
  });

  it("triggerNow becomes a no-op after stop", async () => {
    const tick = vi.fn(async () => undefined);
    worker = new SchedulerWorker({ tick, pollIntervalMs: 60_000 });
    await worker.stop();

    const before = tick.mock.calls.length;
    await worker.triggerNow();
    await new Promise((r) => setTimeout(r, 10));
    expect(tick.mock.calls.length).toBe(before);
    worker = null;
  });
});
