/**
 * 2-han yaku detectors.
 *
 * As with chunk 3's 1-han detectors, each is a pure structural check that
 * returns its han value or `null`. Precedence between overlapping yaku
 * (e.g., Outside Hand vs. All Terminals and Honours) is handled by the
 * orchestrator in chunk 6; here we only encode the *structural* preconditions
 * so that overlapping families remain mutually exclusive at the detector
 * level where possible.
 */

import {
  decompositionTiles,
  isHonourSuit,
  isNumberedSuit,
  isTerminalOrHonour,
  isTerminalRank,
  meldTouchesOutside,
} from "./helpers.ts";
import type { YakuDetector } from "./types.ts";

/** Same numerical run in each of man / pin / sou. */
export const threeColourStraight: YakuDetector = {
  name: "Three Colour Straight",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const runRanksBySuit: Record<"man" | "pin" | "sou", Set<number>> = {
      man: new Set(),
      pin: new Set(),
      sou: new Set(),
    };
    for (const meld of decomp.melds) {
      if (meld.kind !== "run") continue;
      runRanksBySuit[meld.suit].add(meld.rank);
    }
    for (const r of runRanksBySuit.man) {
      if (runRanksBySuit.pin.has(r) && runRanksBySuit.sou.has(r)) return 2;
    }
    return null;
  },
};

/** Runs `1-2-3`, `4-5-6`, and `7-8-9` all present in the same numbered suit. */
export const pureStraight: YakuDetector = {
  name: "Pure Straight",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const runRanksBySuit: Record<"man" | "pin" | "sou", Set<number>> = {
      man: new Set(),
      pin: new Set(),
      sou: new Set(),
    };
    for (const meld of decomp.melds) {
      if (meld.kind !== "run") continue;
      runRanksBySuit[meld.suit].add(meld.rank);
    }
    for (const suit of ["man", "pin", "sou"] as const) {
      const ranks = runRanksBySuit[suit];
      if (ranks.has(1) && ranks.has(4) && ranks.has(7)) return 2;
    }
    return null;
  },
};

/** All four melds are triplets (no runs anywhere). */
export const allTriplets: YakuDetector = {
  name: "All Triplets",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    for (const meld of decomp.melds) {
      if (meld.kind !== "triplet") return null;
    }
    return 2;
  },
};

/** Same numerical triplet in each of man / pin / sou. */
export const threeColourTriplets: YakuDetector = {
  name: "Three Colour Triplets",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const tripletRanksBySuit: Record<"man" | "pin" | "sou", Set<number>> = {
      man: new Set(),
      pin: new Set(),
      sou: new Set(),
    };
    for (const meld of decomp.melds) {
      if (meld.kind !== "triplet") continue;
      if (!isNumberedSuit(meld.suit)) continue;
      tripletRanksBySuit[meld.suit as "man" | "pin" | "sou"].add(meld.rank);
    }
    for (const r of tripletRanksBySuit.man) {
      if (tripletRanksBySuit.pin.has(r) && tripletRanksBySuit.sou.has(r)) {
        return 2;
      }
    }
    return null;
  },
};

/** All Terminals and Honours: every tile is 1, 9, a wind, or a dragon, and
 *  the hand contains *both* terminals and honours (pure-terminal hands are
 *  the All Terminals yakuman, pure-honour hands are All Honours). */
export const allTerminalsAndHonours: YakuDetector = {
  name: "All Terminals and Honours",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    let sawTerminal = false;
    let sawHonour = false;
    const tiles = decompositionTiles(decomp);
    for (const t of tiles) {
      if (!isTerminalOrHonour(t.suit, t.rank)) return null;
      if (isHonourSuit(t.suit)) sawHonour = true;
      else if (isTerminalRank(t.rank)) sawTerminal = true;
    }
    if (!sawTerminal || !sawHonour) return null;
    return 2;
  },
};

/** Outside Hand ("chanta"): every meld and the pair contains at least one
 *  terminal or honour. Requires at least one run (otherwise the hand is
 *  All Terminals and Honours / a yakuman) *and* at least one honour
 *  (otherwise it's Pure Outside Hand at 3 han — chunk 4). */
export const outsideHand: YakuDetector = {
  name: "Outside Hand",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    let sawRun = false;
    let sawHonour = false;
    for (const meld of decomp.melds) {
      if (!meldTouchesOutside(meld)) return null;
      if (meld.kind === "run") sawRun = true;
      if (isHonourSuit(meld.suit)) sawHonour = true;
    }
    if (!meldTouchesOutside(decomp.pair)) return null;
    if (isHonourSuit(decomp.pair.suit)) sawHonour = true;
    if (!sawRun || !sawHonour) return null;
    return 2;
  },
};

/** Little Three Dragons: two of the three dragon tiles form triplets and
 *  the remaining dragon is the pair. The yaku adds 2 han on top of the
 *  two dragon yakuhai (1 han each) that fire automatically. */
export const littleThreeDragons: YakuDetector = {
  name: "Little Three Dragons",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    if (decomp.pair.suit !== "dragon") return null;
    let dragonTriplets = 0;
    for (const meld of decomp.melds) {
      if (
        meld.kind === "triplet" &&
        meld.suit === "dragon"
      ) {
        dragonTriplets += 1;
      }
    }
    if (dragonTriplets !== 2) return null;
    return 2;
  },
};

/** Seven Pairs fires only on the chiitoitsu decomposition form. */
export const sevenPairs: YakuDetector = {
  name: "Seven Pairs",
  detect(decomp) {
    return decomp.form === "chiitoitsu" ? 2 : null;
  },
};

export const TWO_HAN_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  threeColourStraight,
  pureStraight,
  allTriplets,
  threeColourTriplets,
  allTerminalsAndHonours,
  outsideHand,
  littleThreeDragons,
  sevenPairs,
]);
