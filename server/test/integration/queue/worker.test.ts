import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noopBroadcaster } from "../../../src/engine/broadcaster.ts";
import { enqueueCommand } from "../../../src/queue/enqueue-command.ts";
import type { RunQueueTickForGameOptions } from "../../../src/queue/run-tick.ts";
import { QueueWorker } from "../../../src/queue/worker.ts";

type DrainFn = (
  gameId: string,
  options: RunQueueTickForGameOptions,
) => Promise<unknown>;
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";

/**
 * Tiny deferred for orchestrating overlap in the worker. Letting the
 * test resolve a drain at a precise moment is much more reliable than
 * timer-based assertions.
 */
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

describe("QueueWorker", () => {
  let worker: QueueWorker | null = null;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  afterEach(async () => {
    if (worker) {
      await worker.stop();
      worker = null;
    }
  });

  it("trigger runs the drain function with the resolved broadcaster", async () => {
    const drain = vi.fn<DrainFn>(async () => undefined);
    const broadcaster = noopBroadcaster;
    worker = new QueueWorker({
      drain,
      resolveBroadcaster: () => broadcaster,
      // Disable safety-net polling so the test only exercises the trigger path.
      pollIntervalMs: 60_000,
    });

    worker.trigger("game-1");
    await worker.waitForGame("game-1");

    expect(drain).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledWith("game-1", { broadcaster });
  });

  it("coalesces concurrent triggers into a single rerun", async () => {
    const gate1 = deferred<void>();
    const gate2 = deferred<void>();
    const gates = [gate1, gate2];
    const drain = vi.fn<DrainFn>(async () => {
      const gate = gates.shift();
      if (gate) await gate.promise;
    });
    worker = new QueueWorker({ drain, pollIntervalMs: 60_000 });

    // First trigger starts a drain; it parks on gate1.
    worker.trigger("g");
    // Three more triggers arrive while the first drain is in-flight.
    // All three coalesce into a single "rerun = true" flag.
    worker.trigger("g");
    worker.trigger("g");
    worker.trigger("g");

    // Release the first drain. The rerun flag fires a second pass that
    // parks on gate2.
    gate1.resolve();
    await new Promise((r) => setTimeout(r, 0));
    // Release the second drain. The loop sees rerun=false and exits.
    gate2.resolve();
    await worker.waitForGame("g");

    expect(drain).toHaveBeenCalledTimes(2);
  });

  it("does not start a second drain when triggered after the first one settles", async () => {
    const drain = vi.fn<DrainFn>(async () => undefined);
    worker = new QueueWorker({ drain, pollIntervalMs: 60_000 });

    worker.trigger("g");
    await worker.waitForGame("g");

    worker.trigger("g");
    await worker.waitForGame("g");

    // Each `waitForGame` covers exactly one loop iteration.
    expect(drain).toHaveBeenCalledTimes(2);
  });

  it("isolates drain failures: future triggers still run", async () => {
    const errors: Array<{ label: string; err: unknown }> = [];
    let shouldFail = true;
    const drain = vi.fn<DrainFn>(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("boom");
      }
    });
    worker = new QueueWorker({
      drain,
      pollIntervalMs: 60_000,
      onError: (label, err) => errors.push({ label, err }),
    });

    worker.trigger("g");
    await worker.waitForGame("g");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.label).toContain("drain failed for game g");

    worker.trigger("g");
    await worker.waitForGame("g");
    expect(drain).toHaveBeenCalledTimes(2);
    // No additional errors recorded for the successful second pass.
    expect(errors).toHaveLength(1);
  });

  it("pollOnce triggers drains for every game returned by findPendingGames", async () => {
    const drain = vi.fn<DrainFn>(async () => undefined);
    const findPendingGames = vi.fn(async () => ["g1", "g2", "g3"]);
    worker = new QueueWorker({
      drain,
      findPendingGames,
      pollIntervalMs: 60_000,
    });

    await worker.pollOnce();
    await worker.waitForIdle();

    expect(findPendingGames).toHaveBeenCalledTimes(1);
    const calledGames = drain.mock.calls.map((c) => c[0]).sort();
    expect(calledGames).toEqual(["g1", "g2", "g3"]);
  });

  it("default findPendingGames returns distinct game IDs that have pending items", async () => {
    const fixtureA = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const fixtureB = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const pA = fixtureA.participants[0]!;
    const pB = fixtureB.participants[0]!;
    const aOnFixtureA = fixtureA.nodeIdByCode.get("a")!;
    const aOnFixtureB = fixtureB.nodeIdByCode.get("a")!;

    // Two pending items in game A and one in game B — `SELECT DISTINCT`
    // should collapse the duplicates without losing either game.
    await enqueueCommand({
      gameId: fixtureA.gameId,
      gameTeamId: pA.gameTeamId,
      userId: pA.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: aOnFixtureA },
      clientCommandId: randomUUID(),
    });
    await enqueueCommand({
      gameId: fixtureA.gameId,
      gameTeamId: pA.gameTeamId,
      userId: pA.userId,
      commandType: "CHECK_OUT",
      payload: {},
      clientCommandId: randomUUID(),
    });
    await enqueueCommand({
      gameId: fixtureB.gameId,
      gameTeamId: pB.gameTeamId,
      userId: pB.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: aOnFixtureB },
      clientCommandId: randomUUID(),
    });

    const drain = vi.fn<DrainFn>(async () => undefined);
    worker = new QueueWorker({
      drain,
      pollIntervalMs: 60_000,
    });

    await worker.pollOnce();
    await worker.waitForIdle();

    const calledGames = new Set(drain.mock.calls.map((c) => c[0]));
    expect(calledGames).toEqual(new Set([fixtureA.gameId, fixtureB.gameId]));
  });

  it("stop waits for the in-flight drain to settle", async () => {
    const gate = deferred<void>();
    let inDrain = false;
    let drainFinished = false;
    const drain = vi.fn<DrainFn>(async () => {
      inDrain = true;
      await gate.promise;
      drainFinished = true;
    });
    worker = new QueueWorker({ drain, pollIntervalMs: 60_000 });
    worker.trigger("g");
    // Spin briefly so the drain enters its await.
    while (!inDrain) await new Promise((r) => setTimeout(r, 0));

    let stopResolved = false;
    const stopPromise = worker.stop().then(() => {
      stopResolved = true;
    });
    // Give stop() a chance to resolve prematurely if the implementation
    // is buggy.
    await new Promise((r) => setTimeout(r, 25));
    expect(stopResolved).toBe(false);
    expect(drainFinished).toBe(false);

    gate.resolve();
    await stopPromise;
    expect(stopResolved).toBe(true);
    expect(drainFinished).toBe(true);
    worker = null;
  });

  it("rejects triggers after stop", async () => {
    const drain = vi.fn<DrainFn>(async () => undefined);
    worker = new QueueWorker({ drain, pollIntervalMs: 60_000 });
    await worker.stop();
    worker.trigger("g");
    // Give the (no-op) scheduling a tick to be sure nothing fires.
    await new Promise((r) => setTimeout(r, 10));
    expect(drain).not.toHaveBeenCalled();
    worker = null;
  });

  it("start kicks off a recurring poll", async () => {
    const findPendingGames = vi.fn(async () => ["g"]);
    const drain = vi.fn<DrainFn>(async () => undefined);
    worker = new QueueWorker({
      drain,
      findPendingGames,
      pollIntervalMs: 10,
    });
    worker.start();

    // Wait long enough for ~3 poll iterations.
    await new Promise((r) => setTimeout(r, 50));
    expect(findPendingGames.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(drain.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
