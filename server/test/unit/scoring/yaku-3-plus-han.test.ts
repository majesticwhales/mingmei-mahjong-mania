import { describe, expect, it } from "vitest";

import type { ScoringContext } from "../../../src/scoring/context.ts";
import {
  type ChiitoitsuDecomposition,
  type NumberedSuit,
  type Pair,
  type Run,
  type StandardDecomposition,
  type Suit,
  type Triplet,
  WIND_EAST,
  WIND_NORTH,
  type WindRank,
} from "../../../src/scoring/types.ts";
import {
  halfFlush,
  pureOutsideHand,
  twicePureDoubleSequence,
} from "../../../src/scoring/yaku/3-han.ts";
import { fullFlush } from "../../../src/scoring/yaku/6-han.ts";

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
function chiitoi(
  p1: Pair,
  p2: Pair,
  p3: Pair,
  p4: Pair,
  p5: Pair,
  p6: Pair,
  p7: Pair,
): ChiitoitsuDecomposition {
  return { form: "chiitoitsu", pairs: [p1, p2, p3, p4, p5, p6, p7] };
}

function ctx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    seatWind: WIND_EAST as WindRank,
    roundWind: WIND_EAST as WindRank,
    redFivesEnabled: true,
    winningTile: { suit: "man", rank: 1 },
    ...overrides,
  };
}

describe("halfFlush (honitsu)", () => {
  it("fires on one numbered suit plus honours (standard)", () => {
    const decomp = std(
      run("man", 1),
      run("man", 4),
      triplet("man", 9),
      triplet("dragon", 1),
      pair("wind", WIND_EAST),
    );
    expect(halfFlush.detect(decomp, ctx())).toBe(3);
  });

  it("fires on one numbered suit plus honours (chiitoitsu)", () => {
    const decomp = chiitoi(
      pair("pin", 1),
      pair("pin", 3),
      pair("pin", 5),
      pair("pin", 7),
      pair("pin", 9),
      pair("wind", WIND_EAST),
      pair("dragon", 1),
    );
    expect(halfFlush.detect(decomp, ctx())).toBe(3);
  });

  it("does not fire on a pure single-suit hand (no honours)", () => {
    const decomp = std(
      run("man", 1),
      run("man", 4),
      run("man", 7),
      triplet("man", 3),
      pair("man", 9),
    );
    expect(halfFlush.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a pure honour hand", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_NORTH),
      pair("dragon", 3),
    );
    expect(halfFlush.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when more than one numbered suit appears", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 4),
      triplet("man", 9),
      triplet("dragon", 1),
      pair("wind", WIND_EAST),
    );
    expect(halfFlush.detect(decomp, ctx())).toBeNull();
  });
});

describe("pureOutsideHand (junchan)", () => {
  it("fires when every meld touches a terminal, with at least one run and no honours", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 7),
      triplet("sou", 1),
      triplet("man", 9),
      pair("pin", 9),
    );
    expect(pureOutsideHand.detect(decomp, ctx())).toBe(3);
  });

  it("does not fire when a meld is fully composed of simples", () => {
    const decomp = std(
      run("man", 4),
      run("pin", 7),
      triplet("sou", 1),
      triplet("man", 9),
      pair("pin", 9),
    );
    expect(pureOutsideHand.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when honours are present (those route to Outside Hand)", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 7),
      triplet("wind", WIND_EAST),
      triplet("man", 9),
      pair("pin", 9),
    );
    expect(pureOutsideHand.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on an all-triplet pure-terminal hand (those route to All Terminals yakuman)", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("pin", 1),
      triplet("sou", 9),
      triplet("man", 9),
      pair("pin", 9),
    );
    expect(pureOutsideHand.detect(decomp, ctx())).toBeNull();
  });
});

describe("twicePureDoubleSequence (ryanpeikou)", () => {
  it("fires when four runs partition into two pairs of identical runs", () => {
    const decomp = std(
      run("man", 2),
      run("man", 2),
      run("pin", 5),
      run("pin", 5),
      pair("sou", 8),
    );
    expect(twicePureDoubleSequence.detect(decomp, ctx())).toBe(3);
  });

  it("does not fire when only one pair of identical runs is present", () => {
    const decomp = std(
      run("man", 2),
      run("man", 2),
      run("pin", 5),
      run("sou", 4),
      pair("sou", 8),
    );
    expect(twicePureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when any meld is a triplet", () => {
    const decomp = std(
      run("man", 2),
      run("man", 2),
      run("pin", 5),
      triplet("pin", 5),
      pair("sou", 8),
    );
    expect(twicePureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on chiitoitsu (even when it could be reinterpreted as ryanpeikou)", () => {
    const decomp = chiitoi(
      pair("man", 2),
      pair("man", 3),
      pair("man", 4),
      pair("pin", 5),
      pair("pin", 6),
      pair("pin", 7),
      pair("sou", 8),
    );
    expect(twicePureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });
});

describe("fullFlush (chinitsu)", () => {
  it("fires on a single-suit standard hand with no honours", () => {
    const decomp = std(
      run("man", 1),
      run("man", 4),
      run("man", 7),
      triplet("man", 3),
      pair("man", 9),
    );
    expect(fullFlush.detect(decomp, ctx())).toBe(6);
  });

  it("fires on a single-suit chiitoitsu hand", () => {
    const decomp = chiitoi(
      pair("pin", 1),
      pair("pin", 2),
      pair("pin", 4),
      pair("pin", 5),
      pair("pin", 7),
      pair("pin", 8),
      pair("pin", 9),
    );
    expect(fullFlush.detect(decomp, ctx())).toBe(6);
  });

  it("does not fire when honours are present", () => {
    const decomp = std(
      run("man", 1),
      run("man", 4),
      triplet("man", 9),
      triplet("dragon", 1),
      pair("man", 3),
    );
    expect(fullFlush.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when more than one numbered suit appears", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 4),
      triplet("man", 9),
      triplet("sou", 5),
      pair("man", 3),
    );
    expect(fullFlush.detect(decomp, ctx())).toBeNull();
  });
});
