import { type Broadcaster, noopBroadcaster } from "../engine/broadcaster.ts";

/**
 * Process-singleton broadcaster used by `processCommand` and
 * `runSchedulerTick` defaults. Until `setBroadcaster` is called the
 * registry returns the no-op implementation — so code paths that don't
 * boot the Socket.IO server (unit tests, the seed runner, the db
 * migrate script) never accidentally take a hard dependency on a live
 * `io` instance.
 *
 * `index.ts` calls `setBroadcaster(new SocketBroadcaster(io))` once the
 * Socket.IO server is attached; integration tests that exercise the
 * Socket.IO fan-out do the same and call `resetBroadcaster()` in
 * `afterEach` so the next test starts from a clean baseline.
 */
let active: Broadcaster = noopBroadcaster;

export function getBroadcaster(): Broadcaster {
  return active;
}

export function setBroadcaster(broadcaster: Broadcaster): void {
  active = broadcaster;
}

export function resetBroadcaster(): void {
  active = noopBroadcaster;
}
