/**
 * Pure per-slot visibility rules. Single source of truth for the three
 * questions every engine handler / scheduler / projection callsite needs
 * to answer:
 *
 *   1. **Is slot `k` at a node currently claim-unlocked?** Wall-clock-based,
 *      independent of whether the `SLOT_UNLOCKED` scheduled job for slot
 *      `k` has actually fired. Drives `SWAP_TILE` / `CLAIM_WIN` validation
 *      and the station-side reveal (`atStation.tiles[k].visible`). See
 *      TDD §3.3 `canSwapSlot` and §3.13 station rule.
 *
 *   2. **Is slot `k` currently map-revealed?** Phase L §3.13: a separate
 *      timer column `slot_map_unlock_offsets_seconds[k]`. Returns false
 *      when the offset is `NULL` (slot is never on the map regardless of
 *      timer — the "out of play on map" tier). When non-null, returns
 *      `nowMs >= startedAt + offset * 1000`. Independent of the claim
 *      timer above; the only DB-enforced relationship is
 *      `mapOffset[k] IS NULL OR mapOffset[k] >= claimOffset[k]`.
 *
 *   3. **Indices set** versions of both questions, used by the projection
 *      to fold the per-slot booleans into `mapNodes[].tiles[].visible`
 *      and `atStation.tiles[k].visible` in one pass.
 *
 * No DB access here; callers pass the snapshot arrays from `games`. This
 * makes the helpers trivially unit-testable and keeps the visibility rules
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
 * Phase L map-reveal timer view. Decoupled from `SlotUnlockGameView`
 * because callers may have only the claim-timer subset loaded (engine
 * handlers reading `game.slotUnlockOffsetsSeconds` for swap validation),
 * and pulling in the map-timer column there would be dead weight.
 *
 * `slotMapUnlockOffsetsSeconds[k]` is `null` when slot `k` is never on
 * the map (the static "out of play on map" tier), or a non-negative
 * integer seconds offset from `startedAt` otherwise.
 */
export interface SlotMapUnlockGameView {
  id: string;
  startedAt: Date;
  slotMapUnlockOffsetsSeconds: Array<number | null>;
}

/**
 * Wall-clock time at which slot `slotIndex` reveals on the map for the
 * given game. Returns `null` when the offset is `null` (slot is never on
 * the map regardless of clock). Slot 0 evaluates to `startedAt.getTime()`
 * (immediately on-map at start by column-level invariant).
 *
 * Throws `500 internal_error` if `slotIndex` is out of range — the chunk-1
 * cardinality CHECK guarantees the array lines up with `slots_per_node`,
 * so an out-of-range index reaching this helper is a bug, not user input.
 */
export function slotMapUnlockAtMs(
  game: SlotMapUnlockGameView,
  slotIndex: number,
): number | null {
  if (slotIndex < 0 || slotIndex >= game.slotMapUnlockOffsetsSeconds.length) {
    throw new HttpError(
      500,
      "internal_error",
      `Game ${game.id} has no map-unlock offset for slot ${slotIndex} (array length=${game.slotMapUnlockOffsetsSeconds.length})`,
    );
  }
  const offset = game.slotMapUnlockOffsetsSeconds[slotIndex];
  if (offset == null) return null;
  return game.startedAt.getTime() + offset * 1000;
}

/**
 * Has slot `slotIndex` revealed on the map at `nowMs`? Returns `false`
 * for `null` offsets (slot is never on the map). Defaults `nowMs` to
 * `Date.now()` so most callers can omit it.
 */
export function isSlotMapUnlocked(
  game: SlotMapUnlockGameView,
  slotIndex: number,
  nowMs: number = Date.now(),
): boolean {
  const at = slotMapUnlockAtMs(game, slotIndex);
  if (at == null) return false;
  return nowMs >= at;
}

/**
 * Indices `[0, slotsPerNode)` whose tiles are currently map-revealed at
 * `nowMs`. Skips slots whose offset is `null` (never on the map).
 * Companion to `unlockedSlotIndices`; the projection layer uses both to
 * fold map-side and station-side visibility into the
 * `mapNodes[].tiles[].visible` / `atStation.tiles[].visible` booleans.
 */
export function mapUnlockedSlotIndices(
  game: SlotMapUnlockGameView,
  slotsPerNode: number,
  nowMs: number = Date.now(),
): number[] {
  const out: number[] = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (isSlotMapUnlocked(game, k, nowMs)) out.push(k);
  }
  return out;
}

/**
 * When `visibilityPhaseCount === slotsPerNode`, each visibility phase
 * reveals exactly one station tile on the map: phase `k` shows slot `k`.
 * Returns `null` when the static `slot_map_unlock_offsets_seconds`
 * timeline should apply instead.
 */
export function phaseDrivenMapVisibleSlotIndices(
  visibilityPhase: number,
  slotsPerNode: number,
  visibilityPhaseCount: number,
): number[] | null {
  if (visibilityPhaseCount !== slotsPerNode || slotsPerNode <= 1) {
    return null;
  }
  if (
    !Number.isInteger(visibilityPhase) ||
    visibilityPhase < 0 ||
    visibilityPhase >= slotsPerNode
  ) {
    return [];
  }
  return [visibilityPhase];
}
