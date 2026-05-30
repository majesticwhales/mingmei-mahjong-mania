/**
 * Pure per-slot visibility rules (per-slot rollout chunk 6).
 *
 * Single source of truth for two questions every engine handler and
 * projection callsite needs to answer:
 *
 *   1. **Is slot `k` at a node currently unlocked?** Wall-clock-based,
 *      independent of whether the `SLOT_UNLOCKED` scheduled job for slot
 *      `k` has actually fired. The scheduler-emitted event exists for
 *      replay / broadcast — gameplay never waits on it. See TDD §3.3
 *      `canSwapSlot` and §3.4 / §11 chunk 4.
 *
 *   2. **Is slot `k` allowed to be face-up on the map projection?** Pure
 *      lookup of `games.slot_map_visible[k]`. Slot 0 is always `true` by
 *      column-level invariant. Higher slots may be `false`, meaning their
 *      tile is *never* exposed in `mapNodes[].tiles[]` regardless of fog
 *      phase. (Once unlocked, the tile is still visible via `atStation`
 *      to a checked-in team — see §6.3.)
 *
 * No DB access here; callers pass the snapshot arrays from `games`. This
 * makes the helper trivially unit-testable and keeps the visibility rules
 * out of the projection layer's hot path.
 */

import { HttpError } from "../lib/http-error.ts";

/**
 * Game-state subset needed for unlock checks. `startedAt` must be a real
 * `Date` (the game has actually started); `slotUnlockOffsetsSeconds[k]`
 * must exist for every `k` in `[0, slotsPerNode)`. Both invariants are
 * enforced by `game-start-service` and the chunk-5 CHECK constraints.
 */
export interface SlotUnlockGameView {
  id: string;
  startedAt: Date;
  slotUnlockOffsetsSeconds: number[];
}

/**
 * Wall-clock time at which slot `slotIndex` becomes unlocked for the
 * given game. Returns the millisecond timestamp; slot 0 evaluates to
 * `startedAt.getTime()` (already unlocked at start).
 *
 * Throws `500 internal_error` if `slotIndex` is out of range — the chunk-5
 * cardinality CHECK guarantees the array lines up with `slots_per_node`,
 * so an out-of-range index reaching this helper is a bug, not user input.
 */
export function slotUnlockAtMs(
  game: SlotUnlockGameView,
  slotIndex: number,
): number {
  const offset = game.slotUnlockOffsetsSeconds[slotIndex];
  if (offset == null) {
    throw new HttpError(
      500,
      "internal_error",
      `Game ${game.id} has no unlock offset for slot ${slotIndex} (array length=${game.slotUnlockOffsetsSeconds.length})`,
    );
  }
  return game.startedAt.getTime() + offset * 1000;
}

/**
 * Has slot `slotIndex` unlocked at `nowMs`? Defaults `nowMs` to
 * `Date.now()` so most callers can omit it; pass it explicitly when you
 * need determinism (e.g. tests, projection-batching, replay).
 */
export function isSlotUnlocked(
  game: SlotUnlockGameView,
  slotIndex: number,
  nowMs: number = Date.now(),
): boolean {
  return nowMs >= slotUnlockAtMs(game, slotIndex);
}

/**
 * Throwing variant for engine handlers. Rejects with `409 slot_locked`
 * carrying the unlock timestamp so the client can surface a useful
 * "available at HH:MM" hint. The `context` string is interpolated into
 * the error message (e.g. `"slot 1 at STN_42"`).
 */
export function assertSlotUnlocked(
  game: SlotUnlockGameView,
  slotIndex: number,
  context: string,
  nowMs: number = Date.now(),
): void {
  const unlockAt = slotUnlockAtMs(game, slotIndex);
  if (nowMs < unlockAt) {
    throw new HttpError(
      409,
      "slot_locked",
      `${context} unlocks at ${new Date(unlockAt).toISOString()}`,
    );
  }
}

/**
 * Indices `[0, slotsPerNode)` whose tiles are unlocked at `nowMs`. Useful
 * for the future projection layer's `atStation.tiles[]` computation:
 * include only slots returned here. `slotsPerNode` is taken from the
 * caller's `game` rather than inferred from array length because the
 * chunk-5 CHECK already binds them equal — this just makes the dependency
 * explicit at the call site.
 */
export function unlockedSlotIndices(
  game: SlotUnlockGameView,
  slotsPerNode: number,
  nowMs: number = Date.now(),
): number[] {
  const out: number[] = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (isSlotUnlocked(game, k, nowMs)) out.push(k);
  }
  return out;
}

/**
 * Whether slot `slotIndex` is allowed to be exposed in
 * `mapNodes[].tiles[]` *if* the node is otherwise phase-visible. Slot 0
 * is always `true` (column-level invariant). Pure lookup — no time
 * dependency. Out-of-range indices throw `500 internal_error` (same
 * rationale as `slotUnlockAtMs`).
 */
export function isSlotMapVisible(
  slotMapVisible: boolean[],
  slotIndex: number,
): boolean {
  const v = slotMapVisible[slotIndex];
  if (v == null) {
    throw new HttpError(
      500,
      "internal_error",
      `Missing slotMapVisible entry for slot ${slotIndex} (array length=${slotMapVisible.length})`,
    );
  }
  return v;
}

/**
 * Indices `[0, slotsPerNode)` flagged as map-visible. Useful as a
 * one-shot filter applied to a node's per-slot tile array before any
 * phase / team-visibility filtering.
 */
export function mapVisibleSlotIndices(
  slotMapVisible: boolean[],
  slotsPerNode: number,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (isSlotMapVisible(slotMapVisible, k)) out.push(k);
  }
  return out;
}
