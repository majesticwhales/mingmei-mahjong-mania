import { describe, expect, it } from "vitest";

import type { ScoringContext } from "../../../src/scoring/context.ts";
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
  WIND_WEST,
  type WindRank,
} from "../../../src/scoring/types.ts";
import {
  YAKUMAN_HAN,
  allGreen,
  allHonours,
  allTerminals,
  bigFourWinds,
  bigThreeDragons,
  littleFourWinds,
  nineGates,
  thirteenOrphans,
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
function kokushi(p: Pair): KokushiDecomposition {
  return { form: "kokushi", pair: p };
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

describe("bigThreeDragons (daisangen)", () => {
  it("fires on three dragon triplets", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("dragon", 3),
      run("man", 2),
      pair("pin", 8),
    );
    expect(bigThreeDragons.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire on two dragon triplets + dragon pair (Little Three Dragons)", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      run("man", 2),
      run("pin", 3),
      pair("dragon", 3),
    );
    expect(bigThreeDragons.detect(decomp, ctx())).toBeNull();
  });
});

describe("thirteenOrphans (kokushi musou)", () => {
  it("fires on the kokushi decomposition", () => {
    expect(thirteenOrphans.detect(kokushi(pair("man", 1)), ctx())).toBe(
      YAKUMAN_HAN,
    );
  });

  it("does not fire on standard or chiitoitsu", () => {
    const stdDecomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("dragon", 1),
      pair("wind", WIND_EAST),
    );
    expect(thirteenOrphans.detect(stdDecomp, ctx())).toBeNull();
  });
});

describe("allHonours (tsuuiisou)", () => {
  it("fires on a standard hand of all winds and dragons", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("dragon", 1),
      triplet("dragon", 2),
      pair("dragon", 3),
    );
    expect(allHonours.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("fires on a chiitoitsu of all seven honour tile types", () => {
    const decomp = chiitoi(
      pair("wind", WIND_EAST),
      pair("wind", WIND_SOUTH),
      pair("wind", WIND_WEST),
      pair("wind", WIND_NORTH),
      pair("dragon", 1),
      pair("dragon", 2),
      pair("dragon", 3),
    );
    expect(allHonours.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire when a numbered tile is present", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("dragon", 1),
      triplet("man", 1),
      pair("dragon", 3),
    );
    expect(allHonours.detect(decomp, ctx())).toBeNull();
  });
});

describe("allTerminals (chinroutou)", () => {
  it("fires on an all-terminal hand", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("sou", 9),
      pair("pin", 9),
    );
    expect(allTerminals.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire when an honour is present", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("dragon", 1),
      pair("pin", 9),
    );
    expect(allTerminals.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when a simple is present", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("sou", 5),
      pair("pin", 9),
    );
    expect(allTerminals.detect(decomp, ctx())).toBeNull();
  });
});

describe("allGreen (ryuuiisou)", () => {
  it("fires on a hand of only sou 2/3/4/6/8 and green dragon", () => {
    const decomp = std(
      run("sou", 2), // 2-3-4 sou
      run("sou", 2),
      triplet("sou", 6),
      triplet("sou", 8),
      pair("dragon", 3), // green dragon
    );
    expect(allGreen.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire when a non-green tile (sou-5) is present", () => {
    const decomp = std(
      run("sou", 3), // 3-4-5 — sou-5 is not green
      triplet("sou", 6),
      triplet("sou", 8),
      triplet("sou", 2),
      pair("dragon", 3),
    );
    expect(allGreen.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when a non-green dragon (red/white) is present", () => {
    const decomp = std(
      run("sou", 2),
      run("sou", 2),
      triplet("sou", 6),
      triplet("sou", 8),
      pair("dragon", 1), // red dragon, not green
    );
    expect(allGreen.detect(decomp, ctx())).toBeNull();
  });
});

describe("bigFourWinds (daisuushii)", () => {
  it("fires on four wind triplets", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("wind", WIND_NORTH),
      pair("dragon", 1),
    );
    expect(bigFourWinds.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire on three wind triplets + wind pair (Little Four Winds)", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("dragon", 1),
      pair("wind", WIND_NORTH),
    );
    expect(bigFourWinds.detect(decomp, ctx())).toBeNull();
  });
});

describe("littleFourWinds (shousuushii)", () => {
  it("fires on three wind triplets + the fourth wind as the pair", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("dragon", 1),
      pair("wind", WIND_NORTH),
    );
    expect(littleFourWinds.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire on four wind triplets (Big Four Winds)", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("wind", WIND_NORTH),
      pair("dragon", 1),
    );
    expect(littleFourWinds.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when the pair is not a wind", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("dragon", 1),
      pair("dragon", 2),
    );
    expect(littleFourWinds.detect(decomp, ctx())).toBeNull();
  });
});

describe("nineGates (chuuren poutou)", () => {
  it("fires on the canonical 1112345678999 + an extra mid-suit tile", () => {
    // 1112345678999 + extra 5m for 14 tiles. Counts: 1m×3, 2m×1, 3m×1, 4m×1,
    // 5m×2, 6m×1, 7m×1, 8m×1, 9m×3.
    // One valid decomposition: 111m, 234m, 567m, 555m, pair 99m.
    // That has 1m×3 + 5m×3, plus runs 234m, 567m — let me recount:
    //   triplet 111m = 1m×3
    //   run 234m = 2,3,4
    //   run 567m = 5,6,7
    //   triplet 555m = 5m×3 (but we only have 5m×2 total above, doesn't match)
    // Build a decomposition that's consistent with the counts.
    // Pick: 111m, 234m, 567m, 99m triplet, pair 8m.
    //   counts: 1×3 + 2×1 + 3×1 + 4×1 + 5×1 + 6×1 + 7×1 + 9×3 + 8×2 = 14
    //   We need also 5×2 for the canonical core; this distribution has only 5×1.
    //   Slot rules: 1≥3, 2..8≥1 each, 9≥3. Total 14. So one of 2..8 has count 2.
    //   With 5×1, 8×2: that satisfies the rule (8 is the "extra" mid tile).
    const decomp = std(
      triplet("man", 1),
      run("man", 2),
      run("man", 5),
      triplet("man", 9),
      pair("man", 8),
    );
    expect(nineGates.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("does not fire when the 1-rank count is below 3", () => {
    // Same shape, but only 1m×2 (broken into a pair).
    // Counts: 1×2, 2×1, 3×1, 4×1, 5×1, 6×1, 7×1, 8×3, 9×3 = 14
    const decomp = std(
      run("man", 1),
      run("man", 2),
      run("man", 5),
      triplet("man", 8),
      pair("man", 9),
    );
    // Hmm let me recount: run 1m has 1,2,3. run 2m has 2,3,4. run 5m has 5,6,7. triplet 8m. pair 9m.
    //   Counts: 1:1, 2:2, 3:2, 4:1, 5:1, 6:1, 7:1, 8:3, 9:2.
    //   Total: 1+2+2+1+1+1+1+3+2 = 14 ✓
    //   1-count: 1 (< 3) → doesn't fire.
    expect(nineGates.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a multi-suit hand", () => {
    const decomp = std(
      triplet("man", 1),
      run("pin", 2),
      run("pin", 5),
      triplet("sou", 9),
      pair("man", 9),
    );
    expect(nineGates.detect(decomp, ctx())).toBeNull();
  });
});

describe("yakuman stacking sanity (orchestrator-level invariant)", () => {
  it("Big Three Dragons + All Honours both fire on an all-dragon-triplets hand", () => {
    // 3 dragon triplets + 1 wind triplet + wind pair = standard all-honours hand.
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("dragon", 3),
      triplet("wind", WIND_EAST),
      pair("wind", WIND_NORTH),
    );
    expect(bigThreeDragons.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
    expect(allHonours.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });

  it("Little Four Winds + All Honours both fire on a pure-honour shousuushii", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("wind", WIND_WEST),
      triplet("dragon", 1),
      pair("wind", WIND_NORTH),
    );
    expect(littleFourWinds.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
    expect(allHonours.detect(decomp, ctx())).toBe(YAKUMAN_HAN);
  });
});
