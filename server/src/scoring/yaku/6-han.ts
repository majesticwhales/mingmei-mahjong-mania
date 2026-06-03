/**
 * 6-han yaku detector — Full Flush.
 */

import {
  decompositionTiles,
  isHonourSuit,
  isNumberedSuit,
} from "./helpers.ts";
import type { YakuDetector } from "./types.ts";

/** Full Flush ("chinitsu"): every tile is in a single numbered suit. No
 *  honours. Mutually exclusive with Half Flush (chunk 3) — the orchestrator
 *  picks Full Flush whenever it fires. */
export const fullFlush: YakuDetector = {
  name: "Full Flush",
  detect(decomp) {
    if (decomp.form === "kokushi") return null;
    const numberedSuits = new Set<string>();
    for (const t of decompositionTiles(decomp)) {
      if (isHonourSuit(t.suit)) return null;
      if (!isNumberedSuit(t.suit)) return null;
      numberedSuits.add(t.suit);
    }
    if (numberedSuits.size !== 1) return null;
    return 6;
  },
};

export const SIX_HAN_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  fullFlush,
]);
