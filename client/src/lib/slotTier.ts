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
 * Returns a `slotMapVisible` array resized to `slotsPerNode`. Slot 0 is
 * always `true` (server-side invariant). Existing entries are preserved
 * by index; new entries default to `true`; trailing entries are dropped.
 */
export function resizeSlotMapVisible(
  prev: boolean[],
  slotsPerNode: number,
): boolean[] {
  const out: boolean[] = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    if (k === 0) {
      out.push(true);
    } else {
      out.push(prev[k] ?? true);
    }
  }
  return out;
}
