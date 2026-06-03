/**
 * 1-han yaku detectors.
 *
 * Each detector is structurally pure: it inspects a single `HandDecomposition`
 * plus the per-call `ScoringContext` and returns the han value (`1`) if the
 * yaku applies, or `null` otherwise. The orchestrator (chunk 6) walks the
 * full catalog and resolves precedence; the detectors themselves are unaware
 * of each other.
 */

import type { ScoringContext } from "../context.ts";
import {
  DRAGON_GREEN,
  DRAGON_RED,
  DRAGON_WHITE,
  type HandDecomposition,
  type Run,
  type StandardDecomposition,
} from "../types.ts";
import {
  classifyStandardWait,
  decompositionTiles,
  isSimple,
} from "./helpers.ts";
import type { YakuDetector } from "./types.ts";

/** All tiles are simples (2..8 of man / pin / sou). */
export const allSimples: YakuDetector = {
  name: "All Simples",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    const tiles = decompositionTiles(decomp);
    for (const t of tiles) {
      if (!isSimple(t.suit, t.rank)) return null;
    }
    return 1;
  },
};

function hasDragonTriplet(
  decomp: HandDecomposition,
  dragonRank: number,
): boolean {
  if (decomp.form !== "standard") return false;
  for (const meld of decomp.melds) {
    if (
      meld.kind === "triplet" &&
      meld.suit === "dragon" &&
      meld.rank === dragonRank
    ) {
      return true;
    }
  }
  return false;
}

/** Triplet of the red dragon (中). */
export const redDragonYakuhai: YakuDetector = {
  name: "Red Dragon",
  detect(decomp) {
    return hasDragonTriplet(decomp, DRAGON_RED) ? 1 : null;
  },
};

/** Triplet of the white dragon (白). */
export const whiteDragonYakuhai: YakuDetector = {
  name: "White Dragon",
  detect(decomp) {
    return hasDragonTriplet(decomp, DRAGON_WHITE) ? 1 : null;
  },
};

/** Triplet of the green dragon (發). */
export const greenDragonYakuhai: YakuDetector = {
  name: "Green Dragon",
  detect(decomp) {
    return hasDragonTriplet(decomp, DRAGON_GREEN) ? 1 : null;
  },
};

function hasWindTriplet(
  decomp: HandDecomposition,
  windRank: number,
): boolean {
  if (decomp.form !== "standard") return false;
  for (const meld of decomp.melds) {
    if (
      meld.kind === "triplet" &&
      meld.suit === "wind" &&
      meld.rank === windRank
    ) {
      return true;
    }
  }
  return false;
}

/** Triplet of the current round wind. */
export const roundWindYakuhai: YakuDetector = {
  name: "Round Wind",
  detect(decomp, context) {
    return hasWindTriplet(decomp, context.roundWind) ? 1 : null;
  },
};

/** Triplet of this team's seat wind. */
export const seatWindYakuhai: YakuDetector = {
  name: "Seat Wind",
  detect(decomp, context) {
    return hasWindTriplet(decomp, context.seatWind) ? 1 : null;
  },
};

function isYakuhaiPair(
  decomp: StandardDecomposition,
  context: ScoringContext,
): boolean {
  const { pair } = decomp;
  if (pair.suit === "dragon") return true;
  if (pair.suit === "wind") {
    return pair.rank === context.roundWind || pair.rank === context.seatWind;
  }
  return false;
}

/** All Sequences ("pinfu"): all four melds are runs, the pair is non-yakuhai,
 *  and the winning tile completes a 2-sided (ryanmen) wait. */
export const allSequences: YakuDetector = {
  name: "All Sequences",
  detect(decomp, context) {
    if (decomp.form !== "standard") return null;
    for (const meld of decomp.melds) {
      if (meld.kind !== "run") return null;
    }
    if (isYakuhaiPair(decomp, context)) return null;
    const waitShape = classifyStandardWait(decomp, context.winningTile);
    if (waitShape !== "ryanmen") return null;
    return 1;
  },
};

/** Pure Double Sequence ("iipeikou"): the hand contains two identical runs
 *  in the same suit. Mutually exclusive with Twice Pure Double Sequence
 *  (chunk 4), which the orchestrator handles via precedence. */
export const pureDoubleSequence: YakuDetector = {
  name: "Pure Double Sequence",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const runs: Run[] = [];
    for (const meld of decomp.melds) {
      if (meld.kind === "run") runs.push(meld);
    }
    for (let i = 0; i < runs.length; i += 1) {
      for (let j = i + 1; j < runs.length; j += 1) {
        if (runs[i].suit === runs[j].suit && runs[i].rank === runs[j].rank) {
          return 1;
        }
      }
    }
    return null;
  },
};

export const ONE_HAN_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  allSimples,
  redDragonYakuhai,
  whiteDragonYakuhai,
  greenDragonYakuhai,
  roundWindYakuhai,
  seatWindYakuhai,
  allSequences,
  pureDoubleSequence,
]);
