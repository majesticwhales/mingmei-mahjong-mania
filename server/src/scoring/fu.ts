/**
 * Fu calculation.
 *
 * Fu is the "minor points" tally that multiplies with han below mangan. v1
 * is non-dealer tsumo only, all hands are treated as closed (no open/closed
 * distinction in this game), and kans are impossible — those collapse the
 * canonical riichi fu table down to the rules encoded here.
 *
 * Composition:
 *   - Standard:   20 base + 2 tsumo + per-triplet fu + per-pair fu + wait fu, rounded up to next 10.
 *   - Pinfu:      fixed 20 (no tsumo bonus, no triplet / pair / wait fu).
 *   - Chiitoitsu: fixed 25, no rounding.
 *   - Yakuman:    0 (caller skips the fu term for yakuman scoring).
 */

import type { ScoringContext } from "./context.ts";
import type { HandDecomposition } from "./types.ts";
import { allSequences } from "./yaku/1-han.ts";
import { classifyStandardWait, isTerminalOrHonour } from "./yaku/helpers.ts";
import type { Yaku } from "./yaku/types.ts";
import { YAKUMAN_HAN } from "./yaku/yakuman.ts";

const PINFU_NAME = allSequences.name;

export function computeFu(
  decomposition: HandDecomposition,
  context: ScoringContext,
  yakuList: ReadonlyArray<Yaku>,
): number {
  // Yakuman: fu is unused.
  for (const y of yakuList) {
    if (y.han >= YAKUMAN_HAN) return 0;
  }

  if (decomposition.form === "chiitoitsu") return 25;

  // Kokushi only reaches scoring as a yakuman (handled above). Defensive 0.
  if (decomposition.form !== "standard") return 0;

  // All Sequences (pinfu) — fixed 20 fu (drops the tsumo bonus by convention).
  for (const y of yakuList) {
    if (y.name === PINFU_NAME) return 20;
  }

  let fu = 20 + 2; // base + tsumo

  for (const meld of decomposition.melds) {
    if (meld.kind !== "triplet") continue;
    fu += isTerminalOrHonour(meld.suit, meld.rank) ? 8 : 4;
  }

  const { pair } = decomposition;
  if (pair.suit === "dragon") {
    fu += 2;
  } else if (pair.suit === "wind") {
    if (pair.rank === context.roundWind) fu += 2;
    if (pair.rank === context.seatWind) fu += 2;
  }

  const waitShape = classifyStandardWait(decomposition, context.winningTile);
  if (
    waitShape === "kanchan" ||
    waitShape === "penchan" ||
    waitShape === "tanki"
  ) {
    fu += 2;
  }

  return Math.ceil(fu / 10) * 10;
}
