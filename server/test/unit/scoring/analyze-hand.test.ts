import { describe, expect, it } from "vitest";

import {
  type AnalyzeHandInput,
  analyzeHand,
} from "../../../src/scoring/index.ts";
import { scoreCompleteHand } from "../../../src/scoring/orchestrator.ts";
import type { ScoringContext } from "../../../src/scoring/context.ts";
import {
  DRAGON_GREEN,
  DRAGON_RED,
  DRAGON_WHITE,
  type Suit,
  type Tile,
  WIND_EAST,
  WIND_NORTH,
  WIND_SOUTH,
  WIND_WEST,
  type WindRank,
} from "../../../src/scoring/types.ts";

// ------------------------------------------------------------------
// Hand-construction helpers
// ------------------------------------------------------------------

/** Build a tile list from `[suit, rank]` pairs, auto-assigning sequential
 *  `copyIndex` values per tile type. This means the FIRST copy of each
 *  numbered-5 tile is `copyIndex === 0` (the red five). */
function buildTiles(parts: ReadonlyArray<readonly [Suit, number]>): Tile[] {
  const copyCounts = new Map<string, number>();
  return parts.map(([suit, rank]) => {
    const key = `${suit}:${rank}`;
    const idx = copyCounts.get(key) ?? 0;
    copyCounts.set(key, idx + 1);
    return { suit, rank, copyIndex: idx };
  });
}

function m(...ranks: number[]): Array<readonly [Suit, number]> {
  return ranks.map((r) => ["man", r] as const);
}
function p(...ranks: number[]): Array<readonly [Suit, number]> {
  return ranks.map((r) => ["pin", r] as const);
}
function s(...ranks: number[]): Array<readonly [Suit, number]> {
  return ranks.map((r) => ["sou", r] as const);
}
function wind(...ranks: number[]): Array<readonly [Suit, number]> {
  return ranks.map((r) => ["wind", r] as const);
}
function dragon(...ranks: number[]): Array<readonly [Suit, number]> {
  return ranks.map((r) => ["dragon", r] as const);
}

function input(
  tiles: Tile[],
  overrides: Partial<AnalyzeHandInput> = {},
): AnalyzeHandInput {
  return {
    tiles,
    seatWind: WIND_EAST as WindRank,
    roundWind: WIND_EAST as WindRank,
    redFivesEnabled: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    seatWind: WIND_EAST as WindRank,
    roundWind: WIND_EAST as WindRank,
    redFivesEnabled: false,
    winningTile: { suit: "man", rank: 1 },
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Shanten / tenpai routing
// ------------------------------------------------------------------

describe("analyzeHand — shanten routing", () => {
  it("returns shanten without waits when hand is 2+ away from tenpai", () => {
    // Random-ish 13-tile hand that is several away from tenpai.
    const tiles = buildTiles([
      ...m(1, 2, 7, 9),
      ...p(3, 4, 8),
      ...s(1, 5, 9),
      ...wind(1, 2),
      ...dragon(1),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBeGreaterThanOrEqual(1);
    expect(result.waits).toBeUndefined();
  });
});

// ------------------------------------------------------------------
// Tenpai scoring
// ------------------------------------------------------------------

describe("analyzeHand — tenpai with yaku", () => {
  it("scores a tanyao + sanshoku-doujun shanpon tenpai (3 han 30 fu = 4000)", () => {
    // Hand: 234m 234p 234s 55p 88p — tenpai shanpon on 5p / 8p.
    const tiles = buildTiles([
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(5, 5),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(0);
    expect(result.waits).toHaveLength(2);

    for (const w of result.waits!) {
      expect(w.han).toBe(3); // tanyao (1) + sanshoku doujun (2)
      expect(w.fu).toBe(30); // 20 + 2 tsumo + 4 (555/888 simple triplet) → ceil/10
      expect(w.points).toBe(4000);
      expect(w.isYakuman).toBe(false);
      const names = w.yaku.map((y) => y.name);
      expect(names).toContain("All Simples");
      expect(names).toContain("Three Colour Straight");
    }

    const waitRanks = result.waits!.map((w) => w.tile.rank).sort();
    expect(waitRanks).toEqual([5, 8]);
  });

  it("scores a pinfu ryanmen tenpai with sanshoku + iipeikou + tanyao (mangan)", () => {
    // Hand: 23m 234m 234p 234s 88p — waits on 1m (penchan-end of 23m) and
    // 4m (ryanmen). After 4m → 234m + 234m + 234p + 234s + 88p, which
    // fires: pinfu (1) + tanyao (1) + sanshoku-doujun (2) + iipeikou (1)
    // = 5 han, 20 fu → mangan.
    const tiles = buildTiles([
      ...m(2, 3),
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(0);
    const waitsByRank = new Map(
      result.waits!.map((w) => [w.tile.rank, w] as const),
    );
    const wait4 = waitsByRank.get(4)!;
    expect(wait4.isYakuman).toBe(false);
    expect(wait4.fu).toBe(20); // pinfu
    expect(wait4.han).toBe(5);
    expect(wait4.points).toBe(8000); // mangan
    const names4 = wait4.yaku.map((y) => y.name);
    expect(names4).toContain("All Sequences");
    expect(names4).toContain("All Simples");
    expect(names4).toContain("Three Colour Straight");
    expect(names4).toContain("Pure Double Sequence");

    // Sanity check the 1m wait too: drops tanyao (1m is a terminal) and
    // iipeikou (only one 234m in the resulting decomp). Pinfu still fires
    // because 23m → 1m is a 2-sided partial (1m/4m), classified ryanmen.
    const wait1 = waitsByRank.get(1)!;
    expect(wait1.fu).toBe(20);
    expect(wait1.han).toBe(3); // pinfu (1) + sanshoku (2)
    expect(wait1.points).toBe(2700);
  });

  it("returns 0-point waits when the wait completes a hand with no yaku", () => {
    // Hand: 333m 678m 555p 234s 1s — tanki tenpai on 1s.
    // After 1s → 333m 678m 555p 234s 11s: triplets + runs + terminal pair.
    // Has no yaku (no tanyao because of 1s, not toitoi, not pinfu, etc.).
    const tiles = buildTiles([
      ...m(3, 3, 3),
      ...m(6, 7, 8),
      ...p(5, 5, 5),
      ...s(2, 3, 4),
      ...s(1),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(0);
    const wait = result.waits!.find((w) => w.tile.suit === "sou" && w.tile.rank === 1);
    expect(wait).toBeDefined();
    expect(wait!.han).toBe(0);
    expect(wait!.points).toBe(0);
    expect(wait!.yaku).toEqual([]);
    expect(wait!.isYakuman).toBe(false);
  });
});

// ------------------------------------------------------------------
// Decomposition tie-breaks
// ------------------------------------------------------------------

describe("analyzeHand — decomposition tie-break", () => {
  it("prefers Twice Pure Double Sequence (3 han) over Seven Pairs (2 han) on the same hand", () => {
    // Hand: 1122334455667m — 13 tiles. Tenpai on 7m only (multiple ryanpeikou
    // decompositions + a chiitoi decomposition all work; the orchestrator
    // picks the highest-scoring standard decomp).
    //
    // For decomp `11m pair + 234m×2 + 567m×2`, drawing 7m completes the
    // 567m run from a 2-sided 56m partial → ryanmen, so pinfu fires too.
    // Yaku: Pinfu (1) + Twice Pure Double Sequence (3) + Full Flush (6) =
    // 10 han, 20 fu → baiman = 16000.
    const tiles = buildTiles([
      ...m(1, 1),
      ...m(2, 2),
      ...m(3, 3),
      ...m(4, 4),
      ...m(5, 5),
      ...m(6, 6),
      ...m(7),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(0);
    const wait = result.waits!.find((w) => w.tile.suit === "man" && w.tile.rank === 7);
    expect(wait).toBeDefined();
    expect(wait!.isYakuman).toBe(false);
    expect(wait!.han).toBe(10);
    expect(wait!.fu).toBe(20); // pinfu
    expect(wait!.points).toBe(16000); // baiman
    const names = wait!.yaku.map((y) => y.name);
    expect(names).toContain("Twice Pure Double Sequence");
    expect(names).toContain("Full Flush");
    expect(names).toContain("All Sequences");
    expect(names).not.toContain("Seven Pairs"); // lower-scoring decomp loses
    expect(names).not.toContain("Pure Double Sequence"); // subset-eliminated
  });
});

// ------------------------------------------------------------------
// Yakuman path (single + stacked)
// ------------------------------------------------------------------

describe("scoreCompleteHand — yakuman", () => {
  it("scores Big Three Dragons as a single yakuman (32000 points)", () => {
    // 14-tile hand: red 111d, white 222d, green 333d, 234m, 88p.
    const tiles = buildTiles([
      ...dragon(DRAGON_RED, DRAGON_RED, DRAGON_RED),
      ...dragon(DRAGON_WHITE, DRAGON_WHITE, DRAGON_WHITE),
      ...dragon(DRAGON_GREEN, DRAGON_GREEN, DRAGON_GREEN),
      ...m(2, 3, 4),
      ...p(8, 8),
    ]);
    const winningTile = tiles[tiles.length - 1];
    const result = scoreCompleteHand(
      tiles,
      winningTile,
      ctx({ winningTile: { suit: "pin", rank: 8 } }),
    );
    expect(result.isYakuman).toBe(true);
    expect(result.han).toBe(13);
    expect(result.fu).toBe(0);
    expect(result.points).toBe(32000);
    const names = result.yaku.map((y) => y.name);
    expect(names).toContain("Big Three Dragons");
    // Yakuman path drops the dragon-yakuhai (non-yakuman) entries.
    expect(names).not.toContain("Red Dragon");
  });

  it("stacks Big Three Dragons + All Honours into a double yakuman (64000 points)", () => {
    // 14-tile hand: 111d + 222d + 333d + EEE(wind 1) + WW(wind 3) — all honours.
    const tiles = buildTiles([
      ...dragon(DRAGON_RED, DRAGON_RED, DRAGON_RED),
      ...dragon(DRAGON_WHITE, DRAGON_WHITE, DRAGON_WHITE),
      ...dragon(DRAGON_GREEN, DRAGON_GREEN, DRAGON_GREEN),
      ...wind(WIND_EAST, WIND_EAST, WIND_EAST),
      ...wind(WIND_WEST, WIND_WEST),
    ]);
    const winningTile = tiles[tiles.length - 1];
    const result = scoreCompleteHand(
      tiles,
      winningTile,
      ctx({
        seatWind: WIND_SOUTH as WindRank,
        roundWind: WIND_NORTH as WindRank,
        winningTile: { suit: "wind", rank: WIND_WEST },
      }),
    );
    expect(result.isYakuman).toBe(true);
    expect(result.han).toBe(26); // 13 × 2 for display
    expect(result.points).toBe(64000); // 2 × 32000
    const names = result.yaku.map((y) => y.name);
    expect(names).toContain("Big Three Dragons");
    expect(names).toContain("All Honours");
  });

  it("scores Thirteen Orphans (kokushi) as a yakuman with the pair as the wait", () => {
    // 14-tile kokushi: each of the 13 orphans + an extra copy of one.
    const orphans: ReadonlyArray<readonly [Suit, number]> = [
      ["man", 1],
      ["man", 9],
      ["pin", 1],
      ["pin", 9],
      ["sou", 1],
      ["sou", 9],
      ["wind", WIND_EAST],
      ["wind", WIND_SOUTH],
      ["wind", WIND_WEST],
      ["wind", WIND_NORTH],
      ["dragon", DRAGON_RED],
      ["dragon", DRAGON_WHITE],
      ["dragon", DRAGON_GREEN],
    ];
    const tiles = buildTiles([...orphans, ["man", 1] as const]); // doubled 1m
    const winningTile = tiles[tiles.length - 1];
    const result = scoreCompleteHand(
      tiles,
      winningTile,
      ctx({ winningTile: { suit: "man", rank: 1 } }),
    );
    expect(result.isYakuman).toBe(true);
    expect(result.points).toBe(32000);
    expect(result.yaku.map((y) => y.name)).toContain("Thirteen Orphans");
  });
});

// ------------------------------------------------------------------
// Red-five bonus
// ------------------------------------------------------------------

describe("analyzeHand — red-five bonus", () => {
  it("adds +1 han per red-five in the hand when enabled", () => {
    // Hand: 234m 234p 234s 55p 88p, with the FIRST 5p being the red copy.
    // buildTiles assigns copyIndex 0 to the first 5p → that's the red five.
    const tiles = buildTiles([
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(5, 5),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles, { redFivesEnabled: true }));
    expect(result.shanten).toBe(0);
    expect(result.waits).toHaveLength(2);

    const wait5 = result.waits!.find((w) => w.tile.rank === 5)!;
    const wait8 = result.waits!.find((w) => w.tile.rank === 8)!;

    // Wait 8p — the existing red 5p stays in the hand → +1 han.
    // Base: tanyao (1) + sanshoku (2) = 3 han, +1 red five = 4 han, 30 fu.
    expect(wait8.han).toBe(4);
    expect(wait8.fu).toBe(30);
    expect(wait8.points).toBe(7900); // 4 han 30 fu non-dealer tsumo
    expect(wait8.yaku.map((y) => y.name)).toContain("Red Five");

    // Wait 5p — orchestrator constructs the winning tile as copyIndex 1
    // (since copyIndex 0 is already in hand → not red). Still +1 red.
    expect(wait5.han).toBe(4);
    expect(wait5.points).toBe(7900);
    expect(wait5.tile.copyIndex).not.toBe(0);
  });

  it("counts the wait itself as a red five when the existing hand has none", () => {
    // Same shape but constructed so the first 5p doesn't go to copyIndex 0.
    // We accomplish this by including a non-red 5p in the hand and waiting
    // on the red copy. Easiest: hand has one 5p already (non-red copy 1),
    // tenpai expects a 5p completer — the orchestrator picks copyIndex 0.
    //
    // Hand: 234m 234p 234s 5p 567p 88p — wait? Let me build a real tenpai:
    // 234m 234p 234s 55p 88p but with the existing 5p being copyIndex=1.
    // buildTiles assigns 0 first, then 1. We need to force copyIndex=1 first.
    const tiles: Tile[] = [
      ...buildTiles([...m(2, 3, 4), ...p(2, 3, 4), ...s(2, 3, 4), ...p(8, 8)]),
      // Insert one 5p as copyIndex=1 (non-red) — manually, since buildTiles
      // would otherwise assign 0.
      { suit: "pin", rank: 5, copyIndex: 1 },
    ];
    expect(tiles).toHaveLength(12);
    // We need 13 tiles. Add another 5p as copyIndex=2 to keep it non-red.
    tiles.push({ suit: "pin", rank: 5, copyIndex: 2 });
    expect(tiles).toHaveLength(13);
    // Tenpai shape: shanpon on 5p/8p.
    const result = analyzeHand(input(tiles, { redFivesEnabled: true }));
    expect(result.shanten).toBe(0);
    const wait5 = result.waits!.find((w) => w.tile.rank === 5)!;
    // The orchestrator constructs the wait tile as copyIndex 0 (red five).
    expect(wait5.tile.copyIndex).toBe(0);
    // +1 han from the drawn red 5p.
    expect(wait5.han).toBe(4);
    expect(wait5.points).toBe(7900);

    const wait8 = result.waits!.find((w) => w.tile.rank === 8)!;
    // Both existing 5p are non-red → 0 red fives total → base 3 han.
    expect(wait8.han).toBe(3);
    expect(wait8.points).toBe(4000);
  });

  it("does not award red-five bonus when the rule is disabled", () => {
    const tiles = buildTiles([
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(5, 5),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles, { redFivesEnabled: false }));
    for (const w of result.waits!) {
      expect(w.han).toBe(3);
      expect(w.yaku.map((y) => y.name)).not.toContain("Red Five");
    }
  });
});

// ------------------------------------------------------------------
// 14-tile completed-hand routing
// ------------------------------------------------------------------

describe("analyzeHand — 14-tile completed hand routing", () => {
  it("returns shanten -1 with a single scored wait when given 14 tiles", () => {
    const tiles = buildTiles([
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(5, 5, 5),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(-1);
    expect(result.waits).toHaveLength(1);
    expect(result.waits![0].han).toBeGreaterThanOrEqual(3);
  });
});

// ------------------------------------------------------------------
// Sort order
// ------------------------------------------------------------------

describe("analyzeHand — wait sort order", () => {
  it("sorts waits by points descending", () => {
    // A tenpai where two waits score differently. Use ittsu-style 13-tile
    // hand whose two waits produce different yaku totals.
    //
    // Hand: 23m 234p 234s 234m 88p — wait 1m (penchan via 23m? no, 23 is
    // ryanmen) vs 4m. Both pinfu-eligible? After 1m, the 23m+1m forms 123m
    // (with rank 1 — a terminal, drops tanyao but not pinfu). After 4m,
    // forms 234m. Both produce pinfu+sanshoku=3 han, 20 fu (same). Hmm.
    //
    // Let's pick a setup where waits genuinely diverge. Tenpai on red-5p
    // (with red-five rule on) vs another tile: red-five adds +1 han to one
    // wait only.
    //
    // Hand: 234m 234p 234s 55p 88p — shanpon waits on 5p and 8p. With
    // red-fives off: identical 3 han / 4000 points.
    //
    // Switch to red-fives on and verify the 5p wait isn't disadvantaged
    // (both end up 7900). Tie-break then on yaku count: both have same.
    // So both have same points and same sort order — not useful.
    //
    // Use a clear case: hand whose 1m wait is penchan (fu+2) and whose 4m
    // wait is ryanmen with pinfu (20 fu fixed). Different fu, different
    // points.
    const tiles = buildTiles([
      ...m(2, 3),
      ...m(2, 3, 4),
      ...p(2, 3, 4),
      ...s(2, 3, 4),
      ...p(8, 8),
    ]);
    const result = analyzeHand(input(tiles));
    expect(result.shanten).toBe(0);
    expect(result.waits!.length).toBeGreaterThan(1);
    for (let i = 1; i < result.waits!.length; i++) {
      expect(result.waits![i - 1].points).toBeGreaterThanOrEqual(
        result.waits![i].points,
      );
    }
  });
});
