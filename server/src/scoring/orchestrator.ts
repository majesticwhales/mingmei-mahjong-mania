/**
 * Orchestrator: turns a 14-tile complete hand into the best-scoring
 * `AnalyzedWait`.
 *
 * For each valid `HandDecomposition` (standard / chiitoitsu / kokushi), the
 * orchestrator runs the full yaku catalog, applies precedence subset
 * elimination, routes through the yakuman or normal scoring path, and picks
 * the decomposition that yields the highest score. Tie-breaks descend
 * through `(points, yaku count, han, fu)` per the plan.
 */

import { isRedFiveTileIdentity } from "../tiles/red-five.ts";
import type { ScoringContext } from "./context.ts";
import { decomposeChiitoitsu } from "./decomposers/chiitoitsu.ts";
import { decomposeKokushi } from "./decomposers/kokushi.ts";
import { decomposeStandardHand } from "./decomposers/standard.ts";
import { computeFu } from "./fu.ts";
import { computePoints } from "./score.ts";
import { type TileCounts, tilesToCounts } from "./tile-counts.ts";
import type { HandDecomposition, Tile } from "./types.ts";
import { ONE_HAN_DETECTORS } from "./yaku/1-han.ts";
import { TWO_HAN_DETECTORS } from "./yaku/2-han.ts";
import { THREE_HAN_DETECTORS } from "./yaku/3-han.ts";
import { SIX_HAN_DETECTORS } from "./yaku/6-han.ts";
import type { Yaku, YakuDetector } from "./yaku/types.ts";
import { YAKUMAN_DETECTORS, YAKUMAN_HAN } from "./yaku/yakuman.ts";

export interface AnalyzedWait {
  /** The completing tile, with a concrete `copyIndex` (the orchestrator
   *  prefers the red-five copy when one is available and the rule is on). */
  tile: Tile;
  /** Total han, including the red-five contribution. For yakuman, this is
   *  `13 × yakumanCount` for display purposes. */
  han: number;
  /** Fu (already rounded). `0` for yakuman hands. */
  fu: number;
  /** Total points received by the winning team (non-dealer tsumo). */
  points: number;
  /** The yaku that fired, in catalog order. For yakuman wins, only the
   *  yakuman entries are included; for normal wins, includes a "Red Five"
   *  entry whose `han` value is the red-five count when ≥ 1. */
  yaku: Yaku[];
  isYakuman: boolean;
}

/** Display name for the red-five han bonus. */
const RED_FIVE_NAME = "Red Five";

/** Catalog of every detector, ordered to match the surface presentation. */
const ALL_DETECTORS: ReadonlyArray<YakuDetector> = Object.freeze([
  ...ONE_HAN_DETECTORS,
  ...TWO_HAN_DETECTORS,
  ...THREE_HAN_DETECTORS,
  ...SIX_HAN_DETECTORS,
  ...YAKUMAN_DETECTORS,
]);

/** Precedence subset-elimination rules: when both names fire on the same
 *  decomposition, drop the first in favour of the second. */
const PRECEDENCE_PAIRS: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ["Pure Double Sequence", "Twice Pure Double Sequence"],
  ["Half Flush", "Full Flush"],
  ["Outside Hand", "Pure Outside Hand"],
]);

/** Score a 14-tile complete hand. The orchestrator enumerates every
 *  decomposition and picks the best-scoring interpretation. */
export function scoreCompleteHand(
  tiles: readonly Tile[],
  winningTile: Tile,
  context: ScoringContext,
): AnalyzedWait {
  const counts: TileCounts = tilesToCounts(tiles);
  const decompositions: HandDecomposition[] = [
    ...decomposeStandardHand(counts),
    ...decomposeChiitoitsu(counts),
    ...decomposeKokushi(counts),
  ];

  const redFiveBonus = context.redFivesEnabled ? countRedFives(tiles) : 0;

  let best: AnalyzedWait | null = null;

  for (const decomp of decompositions) {
    const candidate = scoreDecomposition(
      decomp,
      winningTile,
      context,
      redFiveBonus,
    );
    if (candidate === null) continue;
    if (isBetter(candidate, best)) best = candidate;
  }

  if (best !== null) return best;

  // No decomposition produced a valid (≥1 yaku) win. Return a 0-score result.
  return {
    tile: winningTile,
    han: 0,
    fu: 0,
    points: 0,
    yaku: [],
    isYakuman: false,
  };
}

function scoreDecomposition(
  decomp: HandDecomposition,
  winningTile: Tile,
  context: ScoringContext,
  redFiveBonus: number,
): AnalyzedWait | null {
  const yakuList: Yaku[] = [];
  for (const detector of ALL_DETECTORS) {
    const han = detector.detect(decomp, context);
    if (han !== null) yakuList.push({ name: detector.name, han });
  }

  const survivingYaku = applyPrecedence(yakuList);

  // Yakuman path
  const yakumanYaku = survivingYaku.filter((y) => y.han === YAKUMAN_HAN);
  if (yakumanYaku.length >= 1) {
    const yakumanCount = yakumanYaku.length;
    const han = YAKUMAN_HAN * yakumanCount;
    const points = computePoints({ han, fu: 0, yakumanCount });
    return {
      tile: winningTile,
      han,
      fu: 0,
      points,
      yaku: yakumanYaku,
      isYakuman: true,
    };
  }

  // Normal path — require at least one non-red-five yaku.
  const baseHan = survivingYaku.reduce((sum, y) => sum + y.han, 0);
  if (baseHan === 0) return null;

  const totalHan = baseHan + redFiveBonus;
  const fu = computeFu(decomp, context, survivingYaku);
  const points = computePoints({ han: totalHan, fu, yakumanCount: 0 });

  const yakuWithRedFive: Yaku[] =
    redFiveBonus > 0
      ? [...survivingYaku, { name: RED_FIVE_NAME, han: redFiveBonus }]
      : survivingYaku;

  return {
    tile: winningTile,
    han: totalHan,
    fu,
    points,
    yaku: yakuWithRedFive,
    isYakuman: false,
  };
}

function applyPrecedence(yaku: ReadonlyArray<Yaku>): Yaku[] {
  if (yaku.length === 0) return [];
  const names = new Set(yaku.map((y) => y.name));
  return yaku.filter((y) => {
    for (const [lower, higher] of PRECEDENCE_PAIRS) {
      if (y.name === lower && names.has(higher)) return false;
    }
    return true;
  });
}

function countRedFives(tiles: readonly Tile[]): number {
  let n = 0;
  for (const t of tiles) {
    if (isRedFiveTileIdentity(t)) n += 1;
  }
  return n;
}

function isBetter(a: AnalyzedWait, b: AnalyzedWait | null): boolean {
  if (b === null) return true;
  if (a.points !== b.points) return a.points > b.points;
  if (a.yaku.length !== b.yaku.length) return a.yaku.length > b.yaku.length;
  if (a.han !== b.han) return a.han > b.han;
  return a.fu > b.fu;
}
