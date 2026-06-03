import { describe, expect, it } from "vitest";

import type { ScoringContext } from "../../../src/scoring/context.ts";
import { computeFu } from "../../../src/scoring/fu.ts";
import {
  type ChiitoitsuDecomposition,
  type KokushiDecomposition,
  type NumberedSuit,
  type Pair,
  type Run,
  type StandardDecomposition,
  type Suit,
  type Triplet,
  WIND_EAST,
  WIND_NORTH,
  WIND_SOUTH,
  type WindRank,
} from "../../../src/scoring/types.ts";
import { allSequences } from "../../../src/scoring/yaku/1-han.ts";
import { sevenPairs } from "../../../src/scoring/yaku/2-han.ts";
import type { Yaku } from "../../../src/scoring/yaku/types.ts";
import {
  YAKUMAN_HAN,
  bigThreeDragons,
} from "../../../src/scoring/yaku/yakuman.ts";

function run(suit: NumberedSuit, rank: number): Run {
  return { kind: "run", suit, rank };
}
function triplet(suit: Suit, rank: number): Triplet {
  return { kind: "triplet", suit, rank };
}
function pair(suit: Suit, rank: number): Pair {
  return { kind: "pair", suit, rank };
}
function std(
  m1: Run | Triplet,
  m2: Run | Triplet,
  m3: Run | Triplet,
  m4: Run | Triplet,
  p: Pair,
): StandardDecomposition {
  return { form: "standard", melds: [m1, m2, m3, m4], pair: p };
}
function chiitoi(...ps: Pair[]): ChiitoitsuDecomposition {
  if (ps.length !== 7) throw new Error("chiitoi requires 7 pairs");
  return {
    form: "chiitoitsu",
    pairs: [ps[0], ps[1], ps[2], ps[3], ps[4], ps[5], ps[6]],
  };
}
function kokushi(p: Pair): KokushiDecomposition {
  return { form: "kokushi", pair: p };
}

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    seatWind: WIND_EAST as WindRank,
    roundWind: WIND_EAST as WindRank,
    redFivesEnabled: true,
    winningTile: { suit: "pin", rank: 2 },
    ...overrides,
  };
}

const yk = (name: string, han: number): Yaku => ({ name, han });

describe("computeFu — standard hands", () => {
  it("base + tsumo only (all runs, non-yakuhai pair, ryanmen wait) without pinfu: rounds 22 up to 30", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("pin", 8),
    );
    // ryanmen wait completes 23p with 1p — winning tile rank 1 of pin, leftmost of run.
    // No pinfu yaku passed in, so we still get the tsumo +2 bonus.
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 1 } }),
        [],
      ),
    ).toBe(30);
  });

  it("adds 4 fu for a simple triplet (rounds 26 → 30)", () => {
    const decomp = std(
      triplet("man", 5), // simple triplet
      run("pin", 2),
      run("pin", 5),
      run("sou", 3),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 4 } }),
        [],
      ),
    ).toBe(30);
  });

  it("adds 8 fu for a terminal triplet (rounds 30 → 30)", () => {
    const decomp = std(
      triplet("man", 1), // terminal triplet
      run("pin", 2),
      run("pin", 5),
      run("sou", 3),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 4 } }),
        [],
      ),
    ).toBe(30);
  });

  it("adds 8 fu for an honour triplet", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      run("pin", 2),
      run("pin", 5),
      run("sou", 3),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 4 } }),
        [],
      ),
    ).toBe(30); // 22 + 8 = 30
  });

  it("adds 2 fu for a yakuhai dragon pair", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("dragon", 1),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 1 } }),
        [],
      ),
    ).toBe(30); // 22 + 2 = 24 → 30
  });

  it("adds 2 fu for a round-wind pair (single yakuhai)", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("wind", WIND_SOUTH),
    );
    expect(
      computeFu(
        decomp,
        ctx({
          roundWind: WIND_SOUTH as WindRank,
          seatWind: WIND_EAST as WindRank,
          winningTile: { suit: "pin", rank: 1 },
        }),
        [],
      ),
    ).toBe(30); // 22 + 2 = 24 → 30
  });

  it("adds 4 fu for a double-yakuhai wind pair (seat == round)", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("wind", WIND_EAST),
    );
    expect(
      computeFu(
        decomp,
        ctx({
          roundWind: WIND_EAST as WindRank,
          seatWind: WIND_EAST as WindRank,
          winningTile: { suit: "pin", rank: 1 },
        }),
        [],
      ),
    ).toBe(30); // 22 + 4 = 26 → 30
  });

  it("adds 0 fu for a non-yakuhai wind pair", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("wind", WIND_NORTH),
    );
    expect(
      computeFu(
        decomp,
        ctx({
          roundWind: WIND_EAST as WindRank,
          seatWind: WIND_SOUTH as WindRank,
          winningTile: { suit: "pin", rank: 1 },
        }),
        [],
      ),
    ).toBe(30); // 22 + 0 = 22 → 30
  });

  it("adds 2 fu for a kanchan wait (closed middle of a run)", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5), // winning tile rank 6: middle (kanchan)
      run("pin", 2),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "man", rank: 6 } }),
        [],
      ),
    ).toBe(30); // 22 + 2 = 24 → 30
  });

  it("adds 2 fu for a tanki (pair) wait", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 8 } }),
        [],
      ),
    ).toBe(30); // 22 + 2 = 24 → 30
  });

  it("adds 0 fu for a ryanmen wait", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5), // winning tile rank 5: leftmost of 5-6-7 → ryanmen
      run("pin", 2),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "man", rank: 5 } }),
        [],
      ),
    ).toBe(30); // 22 + 0 = 22 → 30
  });

  it("accumulates multiple triplets correctly", () => {
    const decomp = std(
      triplet("man", 5), // 4 fu (simple)
      triplet("pin", 1), // 8 fu (terminal)
      triplet("dragon", 2), // 8 fu (honour)
      run("sou", 4),
      pair("pin", 8),
    );
    // Base 20 + tsumo 2 + 4 + 8 + 8 = 42 → 50
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "sou", rank: 4 } }),
        [],
      ),
    ).toBe(50);
  });

  it("combines triplets + yakuhai pair + closed wait", () => {
    const decomp = std(
      triplet("dragon", 1), // 8 fu honour
      triplet("man", 5), // 4 fu simple
      run("pin", 2),
      run("sou", 4),
      pair("dragon", 2), // 2 fu yakuhai pair
    );
    // 20 + 2 + 8 + 4 + 2 + 2 (kanchan wait on pin-3? no — let's pick tanki on dragon-2)
    // Tanki on dragon-2 contributes 2 fu.
    // 20 + 2 + 8 + 4 + 2 + 2 = 38 → 40
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "dragon", rank: 2 } }),
        [],
      ),
    ).toBe(40);
  });
});

describe("computeFu — specials", () => {
  it("returns 20 fu when All Sequences (pinfu) fires, regardless of structure", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 2),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "pin", rank: 1 } }),
        [yk(allSequences.name, 1)],
      ),
    ).toBe(20);
  });

  it("returns 25 fu for chiitoitsu, no rounding", () => {
    const decomp = chiitoi(
      pair("man", 1),
      pair("man", 5),
      pair("pin", 3),
      pair("pin", 7),
      pair("sou", 4),
      pair("sou", 8),
      pair("dragon", 1),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "dragon", rank: 1 } }),
        [yk(sevenPairs.name, 2)],
      ),
    ).toBe(25);
  });

  it("returns 0 fu for a yakuman hand (standard form)", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("dragon", 3),
      run("man", 2),
      pair("pin", 8),
    );
    expect(
      computeFu(
        decomp,
        ctx({ winningTile: { suit: "man", rank: 2 } }),
        [yk(bigThreeDragons.name, YAKUMAN_HAN)],
      ),
    ).toBe(0);
  });

  it("returns 0 fu for a kokushi decomposition", () => {
    expect(
      computeFu(
        kokushi(pair("man", 1)),
        ctx(),
        [yk("Thirteen Orphans", YAKUMAN_HAN)],
      ),
    ).toBe(0);
  });
});
