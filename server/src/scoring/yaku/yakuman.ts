/**
 * Yakuman detectors.
 *
 * Each yakuman returns the sentinel `YAKUMAN_HAN = 13` when it applies, so
 * the score table can route it through the "yakuman base = 8000" branch
 * uniformly. Co-firing yakuman stack additively (e.g., Big Three Dragons +
 * All Honours = 26 han = double yakuman = 16000 base / 64000 total for a
 * non-dealer tsumo).
 */

import {
  DRAGON_GREEN,
  type HandDecomposition,
} from "../types.ts";
import { suitSlice, tileIndex } from "../tile-counts.ts";
import {
  decompositionCounts,
  decompositionTiles,
  isHonourSuit,
  isNumberedSuit,
  isTerminalRank,
} from "./helpers.ts";
import type { YakuDetector } from "./types.ts";

/** Sentinel value carried in the catalog for yakuman. Total han is the sum
 *  of `YAKUMAN_HAN` per co-firing yakuman; the score function treats any
 *  multiple of 13 ≥ 13 as a yakuman family. */
export const YAKUMAN_HAN = 13;

/** Big Three Dragons ("daisangen"): triplets of all three dragons. */
export const bigThreeDragons: YakuDetector = {
  name: "Big Three Dragons",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    let dragonTriplets = 0;
    for (const meld of decomp.melds) {
      if (meld.kind === "triplet" && meld.suit === "dragon") {
        dragonTriplets += 1;
      }
    }
    return dragonTriplets === 3 ? YAKUMAN_HAN : null;
  },
};

/** Thirteen Orphans ("kokushi musou"): fires only on the kokushi decomposition. */
export const thirteenOrphans: YakuDetector = {
  name: "Thirteen Orphans",
  detect(decomp) {
    return decomp.form === "kokushi" ? YAKUMAN_HAN : null;
  },
};

/** All Honours ("tsuuiisou"): every tile is a wind or dragon. */
export const allHonours: YakuDetector = {
  name: "All Honours",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    for (const t of decompositionTiles(decomp)) {
      if (!isHonourSuit(t.suit)) return null;
    }
    return YAKUMAN_HAN;
  },
};

/** All Terminals ("chinroutou"): every tile is rank 1 or 9 of a numbered suit. */
export const allTerminals: YakuDetector = {
  name: "All Terminals",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    for (const t of decompositionTiles(decomp)) {
      if (!isNumberedSuit(t.suit)) return null;
      if (!isTerminalRank(t.rank)) return null;
    }
    return YAKUMAN_HAN;
  },
};

/** All Green ("ryuuiisou"): every tile is one of the six "green" tiles
 *  (sou 2/3/4/6/8, green dragon). */
const GREEN_TILE_INDICES: ReadonlySet<number> = new Set([
  tileIndex("sou", 2),
  tileIndex("sou", 3),
  tileIndex("sou", 4),
  tileIndex("sou", 6),
  tileIndex("sou", 8),
  tileIndex("dragon", DRAGON_GREEN),
]);

export const allGreen: YakuDetector = {
  name: "All Green",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    for (const t of decompositionTiles(decomp)) {
      if (!GREEN_TILE_INDICES.has(tileIndex(t.suit, t.rank))) return null;
    }
    return YAKUMAN_HAN;
  },
};

function countWindTripletRanks(
  decomp: HandDecomposition,
): { triplets: number; ranks: Set<number> } {
  const ranks = new Set<number>();
  let triplets = 0;
  if (decomp.form !== "standard") return { triplets, ranks };
  for (const meld of decomp.melds) {
    if (meld.kind === "triplet" && meld.suit === "wind") {
      triplets += 1;
      ranks.add(meld.rank);
    }
  }
  return { triplets, ranks };
}

/** Big Four Winds ("daisuushii"): four wind triplets. */
export const bigFourWinds: YakuDetector = {
  name: "Big Four Winds",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const { triplets } = countWindTripletRanks(decomp);
    return triplets === 4 ? YAKUMAN_HAN : null;
  },
};

/** Little Four Winds ("shousuushii"): three wind triplets plus the fourth
 *  wind as the pair. */
export const littleFourWinds: YakuDetector = {
  name: "Little Four Winds",
  detect(decomp) {
    if (decomp.form !== "standard") return null;
    const { triplets, ranks } = countWindTripletRanks(decomp);
    if (triplets !== 3) return null;
    if (decomp.pair.suit !== "wind") return null;
    if (ranks.has(decomp.pair.rank)) return null; // would imply a quad, impossible
    return YAKUMAN_HAN;
  },
};

/** Nine Gates ("chuuren poutou"): every tile in one numbered suit; that
 *  suit's distribution satisfies `{1: ≥3, 2..8: ≥1, 9: ≥3}` (the canonical
 *  `1112345678999` core plus any one additional tile in the same suit). */
export const nineGates: YakuDetector = {
  name: "Nine Gates",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    const counts = decompositionCounts(decomp);
    for (const suit of ["man", "pin", "sou"] as const) {
      const slice = suitSlice(counts, suit);
      let total = 0;
      for (const n of slice) total += n;
      if (total !== 14) continue;
      if (slice[0] < 3 || slice[8] < 3) continue;
      let allMidPresent = true;
      for (let r = 1; r <= 7; r += 1) {
        if (slice[r] === 0) {
          allMidPresent = false;
          break;
        }
      }
      if (allMidPresent) return YAKUMAN_HAN;
    }
    return null;
  },
};

export const YAKUMAN_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  bigThreeDragons,
  thirteenOrphans,
  allHonours,
  allTerminals,
  allGreen,
  bigFourWinds,
  littleFourWinds,
  nineGates,
]);
