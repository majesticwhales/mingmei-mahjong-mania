/**
 * Shanten calculation: how many productive tile substitutions a hand needs
 * to reach a winning shape.
 *
 *   -1 = the hand is already winning (14-tile complete hand)
 *    0 = tenpai (one tile away from winning)
 *    1 = iishanten (one tile away from tenpai)
 *    N = N productive swaps away from tenpai
 *
 * Accepts both 13-tile (in-progress) and 14-tile (post-draw) hands. For
 * 14-tile inputs `0` means "discard one tile and draw a different one to
 * win" — same one-swap semantics.
 *
 * Implementation: take the minimum across three winning shapes — standard
 * (4 sets + 1 pair), seven-pairs, and thirteen-orphans. The standard
 * computation uses per-suit DFS over (sets, partials) outcomes, deduplicated
 * to a Pareto frontier and combined across suits.
 */

import {
  type TileCounts,
  TILE_COUNTS_LENGTH,
  suitSlice,
  totalCount,
} from "./tile-counts.ts";
import { ORPHAN_TILE_INDICES } from "./tile-sets.ts";
import type { Suit } from "./types.ts";

/** Theoretical maximum useful shanten for a 13/14-tile standard-form hand. */
const MAX_STANDARD_SHANTEN = 8;

/** All five suits, in canonical order. The first three are numbered (runs
 *  permitted); the last two are honour (triplets only). */
const SUIT_ORDER: ReadonlyArray<{ suit: Suit; numbered: boolean }> = [
  { suit: "man", numbered: true },
  { suit: "pin", numbered: true },
  { suit: "sou", numbered: true },
  { suit: "wind", numbered: false },
  { suit: "dragon", numbered: false },
];

/** Cached per-suit enumeration results, keyed by `(numbered, slice)`. The
 *  state space per suit is bounded (at most ~5^9 distinct slices for numbered,
 *  far fewer in practice), so this Map grows in a bounded fashion across
 *  process lifetime. Each entry is the Pareto frontier of `(sets, partials)`
 *  outcomes for that slice. */
const suitOptionsCache = new Map<string, ReadonlyArray<readonly [number, number]>>();

/** Public entry point. */
export function computeShanten(counts: TileCounts): number {
  const total = totalCount(counts);
  if (total !== 13 && total !== 14) {
    throw new Error(
      `computeShanten requires a 13- or 14-tile hand (got ${total} tiles)`,
    );
  }

  return Math.min(
    computeShantenStandard(counts),
    computeShantenChiitoitsu(counts),
    computeShantenKokushi(counts),
  );
}

/** Seven-pairs shanten.
 *  `6 - distinctPairs + max(0, 7 - distinctTileTypes)` is the canonical form;
 *  the extra term handles cases where the hand has fewer than 7 distinct
 *  tile types (e.g., contains a triplet or quad), making chiitoitsu out of
 *  reach without additional swaps. */
export function computeShantenChiitoitsu(counts: TileCounts): number {
  let distinctPairs = 0;
  let distinctTileTypes = 0;
  for (let i = 0; i < TILE_COUNTS_LENGTH; i++) {
    if (counts[i] >= 1) distinctTileTypes += 1;
    if (counts[i] >= 2) distinctPairs += 1;
  }
  return 6 - distinctPairs + Math.max(0, 7 - distinctTileTypes);
}

/** Thirteen-orphans shanten.
 *  `13 - distinctOrphans - (hasOrphanPair ? 1 : 0)`. */
export function computeShantenKokushi(counts: TileCounts): number {
  let distinctOrphans = 0;
  let hasOrphanPair = 0;
  for (const idx of ORPHAN_TILE_INDICES) {
    if (counts[idx] >= 1) distinctOrphans += 1;
    if (counts[idx] >= 2) hasOrphanPair = 1;
  }
  return 13 - distinctOrphans - hasOrphanPair;
}

/** Standard-form shanten.
 *  Iterates over every tile type as a potential pair (and the no-pair case)
 *  and combines per-suit `(sets, partials)` Pareto frontiers. */
export function computeShantenStandard(counts: TileCounts): number {
  let best = MAX_STANDARD_SHANTEN;

  const noPair = combineStandard(counts, false);
  if (noPair < best) best = noPair;

  const mutable = new Uint8Array(counts);
  for (let pairIdx = 0; pairIdx < TILE_COUNTS_LENGTH; pairIdx++) {
    if (mutable[pairIdx] < 2) continue;
    mutable[pairIdx] -= 2;
    const withPair = combineStandard(mutable, true);
    mutable[pairIdx] += 2;
    if (withPair < best) best = withPair;
  }

  return best;
}

function combineStandard(counts: TileCounts, hasPair: boolean): number {
  let best = MAX_STANDARD_SHANTEN;

  const perSuit: Array<ReadonlyArray<readonly [number, number]>> = [];
  for (const { suit, numbered } of SUIT_ORDER) {
    perSuit.push(suitOptions(suitSlice(counts, suit), numbered));
  }

  const pair = hasPair ? 1 : 0;
  // Iterative 5-way Cartesian product. Keep it inlined for tight loops.
  //
  // Constraint: a winning shape is 4 melds + 1 pair. `sets + partials ≤ 4`
  // because the pair slot is filled exclusively by the explicit pair (via
  // the pair-pivot enumeration); any actual pair in the hand is already
  // designated by that loop, so the no-pair case here truly means "no pair
  // material anywhere," and a leftover proto-run partial cannot substitute
  // for the missing pair.
  for (const [m1, p1] of perSuit[0]) {
    for (const [m2, p2] of perSuit[1]) {
      for (const [m3, p3] of perSuit[2]) {
        for (const [m4, p4] of perSuit[3]) {
          for (const [m5, p5] of perSuit[4]) {
            let sets = m1 + m2 + m3 + m4 + m5;
            let partials = p1 + p2 + p3 + p4 + p5;
            if (sets > 4) sets = 4;
            if (sets + partials > 4) {
              partials = 4 - sets;
              if (partials < 0) partials = 0;
            }
            const sh = 8 - 2 * sets - partials - pair;
            if (sh < best) best = sh;
          }
        }
      }
    }
  }

  return best;
}

/** Cache lookup wrapper around `enumerateSuitOptions`. */
function suitOptions(
  slice: number[],
  numbered: boolean,
): ReadonlyArray<readonly [number, number]> {
  const key = (numbered ? "n:" : "h:") + slice.join(",");
  const cached = suitOptionsCache.get(key);
  if (cached) return cached;
  const computed = paretoFrontier(enumerateSuitOptions(slice, numbered));
  suitOptionsCache.set(key, computed);
  return computed;
}

/** Recursive enumeration of every `(sets, partials)` outcome reachable from
 *  the given suit slice. The slice is mutated and restored in-place. */
function enumerateSuitOptions(
  slice: number[],
  numbered: boolean,
): Array<[number, number]> {
  let start = 0;
  while (start < slice.length && slice[start] === 0) start += 1;
  if (start === slice.length) return [[0, 0]];

  const out: Array<[number, number]> = [];

  // Option: consume one tile as an orphan single.
  slice[start] -= 1;
  for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
    out.push([s, p]);
  }
  slice[start] += 1;

  // Option: triplet.
  if (slice[start] >= 3) {
    slice[start] -= 3;
    for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
      out.push([s + 1, p]);
    }
    slice[start] += 3;
  }

  // Option: pair (proto-triplet partial).
  if (slice[start] >= 2) {
    slice[start] -= 2;
    for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
      out.push([s, p + 1]);
    }
    slice[start] += 2;
  }

  if (numbered && start + 2 < slice.length) {
    // Option: complete run starting at `start`.
    if (slice[start + 1] >= 1 && slice[start + 2] >= 1) {
      slice[start] -= 1;
      slice[start + 1] -= 1;
      slice[start + 2] -= 1;
      for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
        out.push([s + 1, p]);
      }
      slice[start] += 1;
      slice[start + 1] += 1;
      slice[start + 2] += 1;
    }

    // Option: kanchan (proto-run with the middle tile missing).
    if (slice[start + 2] >= 1) {
      slice[start] -= 1;
      slice[start + 2] -= 1;
      for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
        out.push([s, p + 1]);
      }
      slice[start] += 1;
      slice[start + 2] += 1;
    }
  }

  if (numbered && start + 1 < slice.length && slice[start + 1] >= 1) {
    // Option: ryanmen / penchan (proto-run, contiguous two tiles).
    slice[start] -= 1;
    slice[start + 1] -= 1;
    for (const [s, p] of enumerateSuitOptions(slice, numbered)) {
      out.push([s, p + 1]);
    }
    slice[start] += 1;
    slice[start + 1] += 1;
  }

  return out;
}

/** Reduce a list of `(sets, partials)` outcomes to its Pareto frontier: for
 *  each `sets` value (0..4), keep only the maximum `partials`. The shanten
 *  formula is monotonically non-increasing in both, so dominated outcomes
 *  can never produce a lower combined shanten. */
function paretoFrontier(
  options: Array<[number, number]>,
): ReadonlyArray<readonly [number, number]> {
  const maxPartialsForSets = new Map<number, number>();
  for (const [s, p] of options) {
    const cur = maxPartialsForSets.get(s);
    if (cur === undefined || p > cur) maxPartialsForSets.set(s, p);
  }
  const out: Array<readonly [number, number]> = [];
  for (const [s, p] of maxPartialsForSets) {
    out.push([s, p]);
  }
  return out;
}
