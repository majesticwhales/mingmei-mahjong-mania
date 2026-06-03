/**
 * Standard-form decomposer.
 *
 * Given a 14-tile hand, enumerate every valid `4 melds + 1 pair` parse.
 * Honour suits contribute only triplets (no runs); numbered suits contribute
 * runs and/or triplets. A hand may decompose multiple ways (e.g., a tiles
 * pattern that admits both an all-triplets and a runs-plus-triplet reading);
 * downstream scoring picks the highest-scoring parse.
 *
 * Algorithm: pair-pivot. For each tile type with count ≥ 2, tentatively
 * extract it as the pair and recursively decompose the remaining 12 tiles
 * by suit. Per-suit decomposition is a simple backtracking pass that
 * consumes the lowest non-zero rank either as a triplet or as the start
 * of a run.
 */

import type {
  NumberedSuit,
  Pair,
  Run,
  StandardDecomposition,
  Triplet,
} from "../types.ts";
import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  indexToSuitRank,
  suitSlice,
  totalCount,
} from "../tile-counts.ts";

const NUMBERED_SUITS: readonly NumberedSuit[] = ["man", "pin", "sou"];
const HONOUR_SUITS: readonly ("wind" | "dragon")[] = ["wind", "dragon"];

/** Enumerate every run/triplet decomposition of a single numbered-suit slice.
 *  The slice is mutated in place and restored before each return, so a single
 *  buffer can be reused across recursive calls. Returns `[[]]` for an empty
 *  slice (the empty decomposition is valid) and `[]` for an undecomposable
 *  one (e.g., a lone tile that can neither triplet nor run). */
function decomposeNumberedSlice(
  slice: number[],
  suit: NumberedSuit,
): Array<Array<Run | Triplet>> {
  let i = 0;
  while (i < slice.length && slice[i] === 0) i++;
  if (i === slice.length) return [[]];

  const results: Array<Array<Run | Triplet>> = [];

  if (slice[i] >= 3) {
    slice[i] -= 3;
    const sub = decomposeNumberedSlice(slice, suit);
    slice[i] += 3;
    const triplet: Triplet = { kind: "triplet", suit, rank: i + 1 };
    for (const tail of sub) {
      results.push([triplet, ...tail]);
    }
  }

  if (
    i + 2 < slice.length &&
    slice[i] >= 1 &&
    slice[i + 1] >= 1 &&
    slice[i + 2] >= 1
  ) {
    slice[i] -= 1;
    slice[i + 1] -= 1;
    slice[i + 2] -= 1;
    const sub = decomposeNumberedSlice(slice, suit);
    slice[i] += 1;
    slice[i + 1] += 1;
    slice[i + 2] += 1;
    const run: Run = { kind: "run", suit, rank: i + 1 };
    for (const tail of sub) {
      results.push([run, ...tail]);
    }
  }

  return results;
}

/** Honour suits cannot form runs, so after the pair is extracted each
 *  non-zero rank must have count exactly 3 (a triplet). Returns the
 *  deterministic single decomposition, or `null` if undecomposable. */
function decomposeHonourSlice(
  slice: number[],
  suit: "wind" | "dragon",
): Triplet[] | null {
  const melds: Triplet[] = [];
  for (let i = 0; i < slice.length; i++) {
    const n = slice[i];
    if (n === 0) continue;
    if (n === 3) {
      melds.push({ kind: "triplet", suit, rank: i + 1 });
    } else {
      return null;
    }
  }
  return melds;
}

/** Cartesian-combine per-suit decomposition options into flat meld lists. */
function combineAcrossSuits(
  perSuit: Array<Array<Array<Run | Triplet>>>,
): Array<Array<Run | Triplet>> {
  let accumulator: Array<Array<Run | Triplet>> = [[]];
  for (const suitOptions of perSuit) {
    const next: Array<Array<Run | Triplet>> = [];
    for (const acc of accumulator) {
      for (const opt of suitOptions) {
        next.push([...acc, ...opt]);
      }
    }
    accumulator = next;
  }
  return accumulator;
}

/** Public: every standard-form `(4 melds + 1 pair)` decomposition of a 14-tile
 *  hand. Returns an empty array for any input that isn't a winning standard
 *  shape. Does not mutate the input counts. */
export function decomposeStandardHand(
  counts: TileCounts,
): StandardDecomposition[] {
  if (totalCount(counts) !== 14) return [];

  const mutable = new Uint8Array(counts);
  const results: StandardDecomposition[] = [];

  for (let pairIdx = 0; pairIdx < TILE_COUNTS_LENGTH; pairIdx++) {
    if (mutable[pairIdx] < 2) continue;

    mutable[pairIdx] -= 2;
    const pair: Pair = { kind: "pair", ...indexToSuitRank(pairIdx) };

    const perSuit: Array<Array<Array<Run | Triplet>>> = [];
    let valid = true;

    for (const suit of NUMBERED_SUITS) {
      const slice = suitSlice(mutable, suit);
      const opts = decomposeNumberedSlice(slice, suit);
      if (opts.length === 0) {
        valid = false;
        break;
      }
      perSuit.push(opts);
    }

    if (valid) {
      for (const suit of HONOUR_SUITS) {
        const slice = suitSlice(mutable, suit);
        const honourResult = decomposeHonourSlice(slice, suit);
        if (honourResult === null) {
          valid = false;
          break;
        }
        perSuit.push([honourResult]);
      }
    }

    if (valid) {
      for (const melds of combineAcrossSuits(perSuit)) {
        results.push({
          form: "standard",
          melds: melds as StandardDecomposition["melds"],
          pair,
        });
      }
    }

    mutable[pairIdx] += 2;
  }

  return results;
}
