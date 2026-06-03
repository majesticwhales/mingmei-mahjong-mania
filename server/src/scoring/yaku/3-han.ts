/**
 * 3-han yaku detectors.
 *
 * All three are structural; the orchestrator resolves precedence with
 * lower-han neighbours (Twice Pure Double Sequence supersedes Pure Double
 * Sequence; Pure Outside Hand supersedes Outside Hand for hands with no
 * honours; Half Flush is mutually exclusive with the 6-han Full Flush).
 */

import type { Run } from "../types.ts";
import {
  decompositionTiles,
  isHonourSuit,
  meldTouchesOutside,
} from "./helpers.ts";
import type { YakuDetector } from "./types.ts";

/** Half Flush ("honitsu"): exactly one numbered suit plus at least one
 *  honour. (Pure single-suit hands route to Full Flush at 6 han; pure
 *  honour hands route to All Honours, yakuman.) */
export const halfFlush: YakuDetector = {
  name: "Half Flush",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    const numberedSuits = new Set<string>();
    let sawHonour = false;
    for (const t of decompositionTiles(decomp)) {
      if (isHonourSuit(t.suit)) {
        sawHonour = true;
      } else {
        numberedSuits.add(t.suit);
      }
    }
    if (numberedSuits.size !== 1) return null;
    if (!sawHonour) return null;
    return 3;
  },
};

/** Pure Outside Hand ("junchan"): every meld and the pair touches a terminal
 *  (1 or 9), with no honours anywhere, and at least one run (else the hand
 *  would be the All Terminals yakuman). */
export const pureOutsideHand: YakuDetector = {
  name: "Pure Outside Hand",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    let sawRun = false;
    for (const meld of decomp.melds) {
      if (isHonourSuit(meld.suit)) return null;
      if (!meldTouchesOutside(meld)) return null;
      if (meld.kind === "run") sawRun = true;
    }
    if (isHonourSuit(decomp.pair.suit)) return null;
    if (!meldTouchesOutside(decomp.pair)) return null;
    if (!sawRun) return null;
    return 3;
  },
};

/** Twice Pure Double Sequence ("ryanpeikou"): the four melds partition into
 *  two distinct pairs of identical runs. Standard form only — and explicitly
 *  *not* the seven-pairs form: a hand that decomposes as both standard
 *  (ryanpeikou) and chiitoitsu (seven pairs) is scored on the standard
 *  decomposition, which the orchestrator will pick by comparing total
 *  points. */
export const twicePureDoubleSequence: YakuDetector = {
  name: "Twice Pure Double Sequence",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const runs: Run[] = [];
    for (const meld of decomp.melds) {
      if (meld.kind !== "run") return null;
      runs.push(meld);
    }
    // Group runs by (suit, rank) and require exactly two groups of two.
    const groups = new Map<string, number>();
    for (const r of runs) {
      const key = `${r.suit}-${r.rank}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const sizes = [...groups.values()].sort((a, b) => a - b);
    if (sizes.length === 2 && sizes[0] === 2 && sizes[1] === 2) return 3;
    return null;
  },
};

export const THREE_HAN_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  halfFlush,
  pureOutsideHand,
  twicePureDoubleSequence,
]);
