/**
 * Yaku detector type signatures.
 *
 * Each detector is a pure function over a `HandDecomposition` plus the
 * `ScoringContext` and returns the han value if the yaku applies, or `null`
 * if it doesn't. The orchestrator (chunk 6) walks the full catalog and
 * accumulates results.
 */

import type { ScoringContext } from "../context.ts";
import type { HandDecomposition } from "../types.ts";

export interface Yaku {
  name: string;
  han: number;
}

export interface YakuDetector {
  /** User-facing English name (used as `Yaku.name` in the public API). */
  readonly name: string;
  /** Returns the yaku's han value if it applies to the given decomposition,
   *  or `null` if the structural / context preconditions aren't satisfied. */
  detect(
    decomposition: HandDecomposition,
    context: ScoringContext,
  ): number | null;
}
