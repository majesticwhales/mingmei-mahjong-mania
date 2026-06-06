/**
 * Public scoring API.
 *
 * The scoring module exposes a single high-level entry point, `analyzeHand`,
 * that turns a 13- (or 14-) tile hand into shanten + per-wait score info.
 * Everything below is internal plumbing.
 *
 * v1 contract:
 *   - Hands are always treated as fully concealed (no open/closed
 *     distinction, no calls).
 *   - Wins are always non-dealer tsumo.
 *   - There is no kan logic.
 *   - The round wind is randomized per game; each team is assigned a seat
 *     wind. Yakuhai for matching winds (and double yakuhai when round == seat)
 *     are handled by the yaku catalog.
 *   - Red fives (copy-index-0 of suited 5s) contribute +1 han each when
 *     enabled.
 */

import type { ScoringContext } from "./context.ts";
import type { DoraIndicator } from "./dora.ts";
import { type AnalyzedWait, scoreCompleteHand } from "./orchestrator.ts";
import { computeShanten } from "./shanten.ts";
import { tilesToCounts } from "./tile-counts.ts";
import type { Tile, WindRank } from "./types.ts";
import { enumerateTenpaiWaits, type WaitTile } from "./waits.ts";

export type { AnalyzedWait } from "./orchestrator.ts";
export type { WaitTile } from "./waits.ts";
export type { ScoringContext } from "./context.ts";
export type { DoraIndicator } from "./dora.ts";
export { countDora, indicatorToDoraTileType } from "./dora.ts";
export type {
  Tile,
  Suit,
  NumberedSuit,
  HonourSuit,
  WindRank,
  DragonRank,
} from "./types.ts";

export interface AnalyzeHandInput {
  /** The player's hand. 13 tiles ⇒ shanten / tenpai analysis; 14 tiles ⇒
   *  the orchestrator scores it as a completed hand (the last tile is the
   *  winning tile). */
  tiles: ReadonlyArray<Tile>;
  /** This team's assigned seat wind. */
  seatWind: WindRank;
  /** The game's round wind (randomized at game start). */
  roundWind: WindRank;
  /** Whether red-five scoring applies (defaults to `false`). */
  redFivesEnabled?: boolean;
  /**
   * Revealed dora indicators. Each indicator points at one dora tile type
   * via `indicatorToDoraTileType`; every matching tile in the winning hand
   * contributes `+1 han per matching indicator`. Dora is not itself a
   * yaku — it only stacks on top of an existing yaku (mirrors red fives).
   * Defaults to an empty list. v1 always passes a single indicator from
   * the dealer-parked dead wall (chunk 3 wires this from
   * `buildGameStateProjection`).
   */
  doraIndicators?: ReadonlyArray<DoraIndicator>;
}

export interface AnalyzeHandResult {
  /** Shanten distance: `-1` = winning, `0` = tenpai, `1+` = away from tenpai. */
  shanten: number;
  /** Scored waits, sorted by points descending. Present when `shanten <= 0`. */
  waits?: AnalyzedWait[];
}

export function analyzeHand(input: AnalyzeHandInput): AnalyzeHandResult {
  const { tiles, seatWind, roundWind } = input;
  const redFivesEnabled = input.redFivesEnabled ?? false;
  const doraIndicators = input.doraIndicators ?? [];

  const counts = tilesToCounts(tiles);
  const shanten = computeShanten(counts);

  if (shanten > 0) return { shanten };

  if (shanten === 0) {
    const waitTiles = enumerateTenpaiWaits(counts);
    const waits = waitTiles.map((waitTile) =>
      scoreWait(
        tiles,
        waitTile,
        seatWind,
        roundWind,
        redFivesEnabled,
        doraIndicators,
      ),
    );
    waits.sort(compareWaitsByPoints);
    return { shanten: 0, waits };
  }

  // shanten === -1: caller passed a 14-tile complete hand. Score using the
  // last tile as the winning tile.
  const lastTile = tiles[tiles.length - 1];
  if (lastTile === undefined) return { shanten: -1, waits: [] };
  const ctx: ScoringContext = {
    seatWind,
    roundWind,
    redFivesEnabled,
    winningTile: tileToWait(lastTile),
    doraIndicators,
  };
  const scored = scoreCompleteHand(tiles, lastTile, ctx);
  return { shanten: -1, waits: [scored] };
}

function scoreWait(
  existingTiles: ReadonlyArray<Tile>,
  waitTile: WaitTile,
  seatWind: WindRank,
  roundWind: WindRank,
  redFivesEnabled: boolean,
  doraIndicators: ReadonlyArray<DoraIndicator>,
): AnalyzedWait {
  const winningTile = constructWinningTile(
    waitTile,
    existingTiles,
    redFivesEnabled,
  );
  const completeHand: Tile[] = [...existingTiles, winningTile];
  const ctx: ScoringContext = {
    seatWind,
    roundWind,
    redFivesEnabled,
    winningTile: waitTile,
    doraIndicators,
  };
  return scoreCompleteHand(completeHand, winningTile, ctx);
}

/** Pick the most favourable `copyIndex` for the wait tile: red-five copy
 *  when the rule is on and the existing hand doesn't already hold it; any
 *  unused copy otherwise. */
function constructWinningTile(
  waitTile: WaitTile,
  existingTiles: ReadonlyArray<Tile>,
  redFivesEnabled: boolean,
): Tile {
  const isRedEligible =
    (waitTile.suit === "man" ||
      waitTile.suit === "pin" ||
      waitTile.suit === "sou") &&
    waitTile.rank === 5;

  if (redFivesEnabled && isRedEligible) {
    const hasRedAlready = existingTiles.some(
      (t) =>
        t.suit === waitTile.suit &&
        t.rank === waitTile.rank &&
        t.copyIndex === 0,
    );
    if (!hasRedAlready) {
      return { suit: waitTile.suit, rank: waitTile.rank, copyIndex: 0 };
    }
  }

  const used = new Set<number>();
  for (const t of existingTiles) {
    if (t.suit === waitTile.suit && t.rank === waitTile.rank) {
      used.add(t.copyIndex);
    }
  }
  for (let i = 0; i < 4; i++) {
    if (!used.has(i)) {
      return { suit: waitTile.suit, rank: waitTile.rank, copyIndex: i };
    }
  }
  // Defensive: enumerateTenpaiWaits already filters tiles with 4 copies in
  // hand, so this fallback shouldn't be reachable.
  return { suit: waitTile.suit, rank: waitTile.rank, copyIndex: 0 };
}

function tileToWait(tile: Tile): WaitTile {
  // `Tile.suit` is `string`; trust the caller to provide a scoring-domain
  // suit. The downstream `tilesToCounts` call has already validated this.
  return { suit: tile.suit as WaitTile["suit"], rank: tile.rank };
}

function compareWaitsByPoints(a: AnalyzedWait, b: AnalyzedWait): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.yaku.length !== b.yaku.length) return b.yaku.length - a.yaku.length;
  if (a.han !== b.han) return b.han - a.han;
  return b.fu - a.fu;
}
