/**
 * Score calculation.
 *
 * `computePoints` converts (han, fu, yakumanCount) into the total points
 * received by the winner for a non-dealer tsumo win.
 *
 * Terminology:
 *   - `base` (a.k.a. kihon-ten / "basic points") is the intermediate scoring
 *     unit. The mangan ceiling is `base = 2000`.
 *   - `total` is what the winner actually receives, summed across the three
 *     paying opponents with per-payer round-up to the next 100.
 *
 * Non-dealer tsumo payments:
 *   - The dealer pays `2 * base`, rounded up to the next 100.
 *   - Each of the two non-dealers pays `base`, rounded up to the next 100.
 *   - `total = dealer_payment + 2 * non_dealer_payment`.
 *
 * For `base ≥ 2000` (mangan and above) base is always a multiple of 1000, so
 * the per-payer rounding is a no-op and `total === 4 * base` exactly.
 *
 * Yakuman handling:
 *   - Actual yakuman (`yakumanCount ≥ 1`): `base = 8000 × yakumanCount`,
 *     stacking additively for co-firing yakuman (e.g., 2 yakuman → base
 *     16000 → total 64000).
 *   - Counted yakuman (`yakumanCount === 0`, `han ≥ 13`): treated as a
 *     single yakuman with `base = 8000` → total 32000.
 */

export interface ComputePointsInput {
  /** Total han (yakuman are counted as `13 × yakumanCount` and so will already
   *  push this value to `≥ 13`, but `yakumanCount` is the canonical signal
   *  used for routing — see `yakumanCount` below). */
  han: number;
  /** Fu, already rounded per `computeFu`. Ignored when the yakuman path
   *  fires. */
  fu: number;
  /** Number of yakuman that fired on this hand. `0` for a normal hand,
   *  `≥ 1` for a (possibly stacked) yakuman hand. */
  yakumanCount: number;
}

/** Mangan base ceiling. Any `fu × 2^(han+2)` exceeding this is clamped. */
export const MANGAN_BASE = 2000;
const HANEMAN_BASE = 3000;
const BAIMAN_BASE = 4000;
const SANBAIMAN_BASE = 6000;
const YAKUMAN_BASE = 8000;

export function computePoints(input: ComputePointsInput): number {
  const { han, fu, yakumanCount } = input;

  if (yakumanCount >= 1) {
    return nonDealerTsumoTotal(YAKUMAN_BASE * yakumanCount);
  }

  if (han >= 13) return nonDealerTsumoTotal(YAKUMAN_BASE); // counted yakuman
  if (han >= 11) return nonDealerTsumoTotal(SANBAIMAN_BASE);
  if (han >= 8) return nonDealerTsumoTotal(BAIMAN_BASE);
  if (han >= 6) return nonDealerTsumoTotal(HANEMAN_BASE);
  if (han >= 5) return nonDealerTsumoTotal(MANGAN_BASE);

  if (han <= 0) return 0;
  const rawBase = fu * Math.pow(2, 2 + han);
  const base = Math.min(rawBase, MANGAN_BASE);
  return nonDealerTsumoTotal(base);
}

/** Non-dealer tsumo total. Per-payer rounding to next 100. */
function nonDealerTsumoTotal(base: number): number {
  const dealerPayment = roundUpTo100(2 * base);
  const nonDealerPayment = roundUpTo100(base);
  return dealerPayment + 2 * nonDealerPayment;
}

function roundUpTo100(n: number): number {
  return Math.ceil(n / 100) * 100;
}
