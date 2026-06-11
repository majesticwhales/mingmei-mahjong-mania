/**
 * Pure helpers for the host config form's "Slot tier" section.
 *
 * Auto-distribute generates a set of slot unlock offsets that are spaced
 * evenly across the game duration: slot k unlocks at `round(D * k / n)`
 * seconds from game start, where D is the total game duration and n is
 * `slotsPerNode`. The form derives the auto-distribute toggle state on
 * mount by comparing the saved offsets to the formula's output via
 * `offsetsMatchAutoDistribute`. There is no persisted "auto-distribute"
 * field on the server — only the resulting arrays are sent.
 */

const TOLERANCE_SECONDS = 1;

/**
 * Returns `[0, round(D/n), round(2D/n), ..., round((n-1)D/n)]`. Length
 * always equals `slotsPerNode`. The result is suitable as the value of
 * `LobbyConfigDto.slotUnlockOffsetsSeconds`.
 *
 * Guards: `slotsPerNode >= 1` is assumed (form enforces min=1). For
 * `slotsPerNode = 1` returns `[0]`. For non-finite or negative
 * `gameDurationSeconds`, returns `[0, 0, ...]` — the form should never
 * pass those in, but we don't want a NaN to leak into the patch.
 */
export function deriveAutoDistributedOffsets(
  slotsPerNode: number,
  gameDurationSeconds: number,
): number[] {
  const out: number[] = [];
  const duration = Number.isFinite(gameDurationSeconds) && gameDurationSeconds > 0
    ? gameDurationSeconds
    : 0;
  for (let k = 0; k < slotsPerNode; k += 1) {
    out.push(Math.round((duration * k) / slotsPerNode));
  }
  return out;
}

/**
 * Returns `true` when the saved offsets match the auto-distribute formula
 * to within +/- 1 second per slot (absorbs rounding). Length mismatches
 * always return `false`.
 */
export function offsetsMatchAutoDistribute(
  offsets: number[],
  slotsPerNode: number,
  gameDurationSeconds: number,
): boolean {
  if (offsets.length !== slotsPerNode) return false;
  const expected = deriveAutoDistributedOffsets(slotsPerNode, gameDurationSeconds);
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (Math.abs(offsets[k] - expected[k]) > TOLERANCE_SECONDS) return false;
  }
  return true;
}

/**
 * Phase L §3.13: Returns a `slotMapUnlockOffsetsSeconds` array resized
 * to `slotsPerNode`. Slot 0 is always `0` (server-side invariant — slot
 * 0 is immediately on the map at start). Existing entries are preserved
 * by index; new entries default to `0` (immediately on the map);
 * trailing entries are dropped.
 *
 * Elements may be `null`, signifying "this slot is never on the map"
 * (the "out of play on map" tier). Server-side, the entries must
 * additionally satisfy `value === null || value >= claim[k]` — the form
 * is responsible for keeping the map and claim arrays consistent on
 * patch.
 */
export function resizeSlotMapUnlockOffsets(
  prev: Array<number | null>,
  slotsPerNode: number,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (k === 0) {
      out.push(0);
    } else if (k < prev.length) {
      out.push(prev[k]);
    } else {
      out.push(0);
    }
  }
  return out;
}
