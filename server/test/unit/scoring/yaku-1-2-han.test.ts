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
import type { WaitTile } from "../../../src/scoring/waits.ts";
import {
  allSequences,
  allSimples,
  greenDragonYakuhai,
  pureDoubleSequence,
  redDragonYakuhai,
  roundWindYakuhai,
  seatWindYakuhai,
  whiteDragonYakuhai,
} from "../../../src/scoring/yaku/1-han.ts";
import {
  allTerminalsAndHonours,
  allTriplets,
  littleThreeDragons,
  outsideHand,
  pureStraight,
  sevenPairs,
  threeColourStraight,
  threeColourTriplets,
} from "../../../src/scoring/yaku/2-han.ts";

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

function wait(suit: Suit, rank: number): WaitTile {
  return { suit, rank };
}

describe("allSimples", () => {
  it("fires on a standard hand of only 2..8 numbered tiles", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      run("sou", 6),
      pair("pin", 8),
    );
    expect(allSimples.detect(decomp, ctx({ winningTile: wait("man", 2) }))).toBe(1);
  });

  it("rejects hands containing a terminal", () => {
    const decomp = std(
      run("man", 1), // contains 1
      run("man", 5),
      run("pin", 3),
      run("sou", 6),
      pair("pin", 8),
    );
    expect(allSimples.detect(decomp, ctx())).toBeNull();
  });

  it("rejects hands containing an honour", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(allSimples.detect(decomp, ctx())).toBeNull();
  });

  it("fires on a chiitoitsu hand of only simples", () => {
    const decomp = chiitoi(
      pair("man", 2),
      pair("man", 6),
      pair("pin", 3),
      pair("pin", 7),
      pair("sou", 4),
      pair("sou", 5),
      pair("sou", 8),
    );
    expect(allSimples.detect(decomp, ctx())).toBe(1);
  });

  it("returns null on a kokushi decomposition", () => {
    expect(allSimples.detect(kokushi(pair("man", 1)), ctx())).toBeNull();
  });
});

describe("dragon yakuhai", () => {
  it("redDragonYakuhai fires on a triplet of dragon-1", () => {
    const decomp = std(
      triplet("dragon", 1),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(redDragonYakuhai.detect(decomp, ctx())).toBe(1);
    expect(whiteDragonYakuhai.detect(decomp, ctx())).toBeNull();
    expect(greenDragonYakuhai.detect(decomp, ctx())).toBeNull();
  });

  it("whiteDragonYakuhai fires on a triplet of dragon-2", () => {
    const decomp = std(
      triplet("dragon", 2),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(whiteDragonYakuhai.detect(decomp, ctx())).toBe(1);
  });

  it("greenDragonYakuhai fires on a triplet of dragon-3", () => {
    const decomp = std(
      triplet("dragon", 3),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(greenDragonYakuhai.detect(decomp, ctx())).toBe(1);
  });

  it("does not fire when the dragon is only a pair", () => {
    const decomp = std(
      run("man", 2),
      run("man", 6),
      run("pin", 3),
      run("sou", 4),
      pair("dragon", 1),
    );
    expect(redDragonYakuhai.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a non-standard decomposition", () => {
    const decomp = chiitoi(
      pair("dragon", 1),
      pair("dragon", 2),
      pair("dragon", 3),
      pair("wind", 1),
      pair("wind", 2),
      pair("wind", 3),
      pair("wind", 4),
    );
    expect(redDragonYakuhai.detect(decomp, ctx())).toBeNull();
  });
});

describe("wind yakuhai", () => {
  it("roundWindYakuhai fires on a triplet of the round wind", () => {
    const decomp = std(
      triplet("wind", WIND_SOUTH),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      roundWindYakuhai.detect(
        decomp,
        ctx({ roundWind: WIND_SOUTH as WindRank, seatWind: WIND_EAST as WindRank }),
      ),
    ).toBe(1);
  });

  it("seatWindYakuhai fires on a triplet of the seat wind", () => {
    const decomp = std(
      triplet("wind", WIND_WEST),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      seatWindYakuhai.detect(
        decomp,
        ctx({ roundWind: WIND_EAST as WindRank, seatWind: WIND_WEST as WindRank }),
      ),
    ).toBe(1);
  });

  it("both round and seat wind yakuhai fire on a double yakuhai (East seat in East round)", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    const context = ctx({
      roundWind: WIND_EAST as WindRank,
      seatWind: WIND_EAST as WindRank,
    });
    expect(roundWindYakuhai.detect(decomp, context)).toBe(1);
    expect(seatWindYakuhai.detect(decomp, context)).toBe(1);
  });

  it("does not fire when the wind triplet matches neither seat nor round", () => {
    const decomp = std(
      triplet("wind", WIND_NORTH),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    const context = ctx({
      roundWind: WIND_EAST as WindRank,
      seatWind: WIND_SOUTH as WindRank,
    });
    expect(roundWindYakuhai.detect(decomp, context)).toBeNull();
    expect(seatWindYakuhai.detect(decomp, context)).toBeNull();
  });
});

describe("allSequences (pinfu)", () => {
  it("fires on 4 runs, non-yakuhai pair, and a ryanmen wait", () => {
    const decomp = std(
      run("man", 2), // 234m
      run("man", 5), // 567m — winning tile completes this run's ryanmen at rank 5 (from proto 6-7)
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("man", 5) })),
    ).toBe(1);
  });

  it("does not fire when a triplet is present", () => {
    const decomp = std(
      run("man", 2),
      triplet("man", 5),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("man", 2) })),
    ).toBeNull();
  });

  it("does not fire when the pair is a yakuhai (dragon)", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      run("sou", 4),
      pair("dragon", 1),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("man", 2) })),
    ).toBeNull();
  });

  it("does not fire when the pair is the round wind", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      run("sou", 4),
      pair("wind", WIND_EAST),
    );
    expect(
      allSequences.detect(
        decomp,
        ctx({
          roundWind: WIND_EAST as WindRank,
          seatWind: WIND_NORTH as WindRank,
          winningTile: wait("man", 2),
        }),
      ),
    ).toBeNull();
  });

  it("does not fire on a kanchan (closed-middle) wait", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5), // winning tile at rank 6 → middle of 5-6-7
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("man", 6) })),
    ).toBeNull();
  });

  it("does not fire on a penchan (edge run) wait", () => {
    const decomp = std(
      run("man", 2),
      run("man", 7), // 789m — winning tile rank 7 (proto 8,9 penchan)
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("man", 7) })),
    ).toBeNull();
  });

  it("does not fire on a tanki (pair) wait", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(
      allSequences.detect(decomp, ctx({ winningTile: wait("pin", 8) })),
    ).toBeNull();
  });
});

describe("pureDoubleSequence (iipeikou)", () => {
  it("fires on two identical runs in the same suit", () => {
    const decomp = std(
      run("man", 2),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(pureDoubleSequence.detect(decomp, ctx())).toBe(1);
  });

  it("does not fire on two same-rank runs in different suits", () => {
    const decomp = std(
      run("man", 2),
      run("pin", 2),
      run("pin", 5),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(pureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire when no two melds are identical", () => {
    const decomp = std(
      run("man", 2),
      run("man", 5),
      run("pin", 3),
      run("sou", 4),
      pair("pin", 8),
    );
    expect(pureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on chiitoitsu", () => {
    const decomp = chiitoi(
      pair("man", 2),
      pair("man", 6),
      pair("pin", 3),
      pair("pin", 7),
      pair("sou", 4),
      pair("sou", 5),
      pair("sou", 8),
    );
    expect(pureDoubleSequence.detect(decomp, ctx())).toBeNull();
  });
});

describe("threeColourStraight", () => {
  it("fires when the same run appears in all three numbered suits", () => {
    const decomp = std(
      run("man", 3),
      run("pin", 3),
      run("sou", 3),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(threeColourStraight.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire when only two suits match", () => {
    const decomp = std(
      run("man", 3),
      run("pin", 3),
      run("sou", 4),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(threeColourStraight.detect(decomp, ctx())).toBeNull();
  });
});

describe("pureStraight", () => {
  it("fires when one suit contains 1-2-3, 4-5-6, and 7-8-9", () => {
    const decomp = std(
      run("man", 1),
      run("man", 4),
      run("man", 7),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(pureStraight.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire when the three runs span different suits", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 4),
      run("sou", 7),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(pureStraight.detect(decomp, ctx())).toBeNull();
  });
});

describe("allTriplets (toitoi)", () => {
  it("fires when every meld is a triplet", () => {
    const decomp = std(
      triplet("man", 2),
      triplet("pin", 4),
      triplet("sou", 6),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(allTriplets.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire when at least one meld is a run", () => {
    const decomp = std(
      triplet("man", 2),
      run("pin", 4),
      triplet("sou", 6),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(allTriplets.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on chiitoitsu", () => {
    const decomp = chiitoi(
      pair("man", 2),
      pair("man", 6),
      pair("pin", 3),
      pair("pin", 7),
      pair("sou", 4),
      pair("sou", 5),
      pair("sou", 8),
    );
    expect(allTriplets.detect(decomp, ctx())).toBeNull();
  });
});

describe("threeColourTriplets", () => {
  it("fires when the same triplet rank appears in man / pin / sou", () => {
    const decomp = std(
      triplet("man", 3),
      triplet("pin", 3),
      triplet("sou", 3),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(threeColourTriplets.detect(decomp, ctx())).toBe(2);
  });

  it("ignores honour triplets when matching across suits", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("man", 5),
      pair("pin", 8),
    );
    expect(threeColourTriplets.detect(decomp, ctx())).toBeNull();
  });
});

describe("allTerminalsAndHonours (honroutou)", () => {
  it("fires on a mix of terminal and honour groups", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("dragon", 2),
      pair("wind", WIND_NORTH),
    );
    expect(allTerminalsAndHonours.detect(decomp, ctx())).toBe(2);
  });

  it("rejects hands with simples anywhere", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 5), // simple
      triplet("dragon", 2),
      pair("wind", WIND_NORTH),
    );
    expect(allTerminalsAndHonours.detect(decomp, ctx())).toBeNull();
  });

  it("rejects pure-terminal hands (would be the All Terminals yakuman)", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("man", 9),
      triplet("pin", 1),
      triplet("sou", 9),
      pair("pin", 9),
    );
    expect(allTerminalsAndHonours.detect(decomp, ctx())).toBeNull();
  });

  it("rejects pure-honour hands (would be the All Honours yakuman)", () => {
    const decomp = std(
      triplet("wind", WIND_EAST),
      triplet("wind", WIND_SOUTH),
      triplet("dragon", 1),
      triplet("dragon", 2),
      pair("dragon", 3),
    );
    expect(allTerminalsAndHonours.detect(decomp, ctx())).toBeNull();
  });

  it("fires on a mixed terminal/honour chiitoitsu", () => {
    const decomp = chiitoi(
      pair("man", 1),
      pair("man", 9),
      pair("pin", 1),
      pair("pin", 9),
      pair("sou", 9),
      pair("wind", WIND_EAST),
      pair("dragon", 1),
    );
    expect(allTerminalsAndHonours.detect(decomp, ctx())).toBe(2);
  });
});

describe("outsideHand (chanta)", () => {
  it("fires when every meld touches the outside, with at least one run and one honour", () => {
    const decomp = std(
      run("man", 1), // 1-2-3 — touches the outside via the 1
      run("pin", 7), // 7-8-9 — touches via the 9
      triplet("wind", WIND_EAST), // honour triplet
      triplet("dragon", 1),
      pair("sou", 9), // terminal pair
    );
    expect(outsideHand.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire when a meld is fully composed of simples", () => {
    const decomp = std(
      run("man", 4), // 4-5-6 — entirely simple
      run("pin", 7),
      triplet("wind", WIND_EAST),
      triplet("dragon", 1),
      pair("sou", 9),
    );
    expect(outsideHand.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on an all-triplet hand (those route to honroutou)", () => {
    const decomp = std(
      triplet("man", 1),
      triplet("pin", 9),
      triplet("wind", WIND_EAST),
      triplet("dragon", 1),
      pair("sou", 9),
    );
    expect(outsideHand.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a numbered-only outside hand (those route to Pure Outside Hand at 3 han)", () => {
    const decomp = std(
      run("man", 1),
      run("pin", 7),
      triplet("sou", 1),
      triplet("man", 9),
      pair("pin", 9),
    );
    expect(outsideHand.detect(decomp, ctx())).toBeNull();
  });
});

describe("littleThreeDragons (shousangen)", () => {
  it("fires on two dragon triplets and a dragon pair", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      run("man", 2),
      run("pin", 3),
      pair("dragon", 3),
    );
    expect(littleThreeDragons.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire on three dragon triplets (would be Big Three Dragons)", () => {
    const decomp = std(
      triplet("dragon", 1),
      triplet("dragon", 2),
      triplet("dragon", 3),
      run("man", 2),
      pair("pin", 8),
    );
    expect(littleThreeDragons.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a single dragon triplet plus dragon pair", () => {
    const decomp = std(
      triplet("dragon", 1),
      run("man", 2),
      run("pin", 3),
      run("sou", 4),
      pair("dragon", 2),
    );
    expect(littleThreeDragons.detect(decomp, ctx())).toBeNull();
  });
});

describe("sevenPairs (chiitoitsu)", () => {
  it("fires on a chiitoitsu decomposition", () => {
    const decomp = chiitoi(
      pair("man", 1),
      pair("man", 5),
      pair("man", 9),
      pair("pin", 3),
      pair("pin", 7),
      pair("wind", WIND_EAST),
      pair("dragon", 3),
    );
    expect(sevenPairs.detect(decomp, ctx())).toBe(2);
  });

  it("does not fire on a standard decomposition", () => {
    const decomp = std(
      run("man", 2),
      run("pin", 3),
      triplet("sou", 4),
      triplet("dragon", 1),
      pair("pin", 8),
    );
    expect(sevenPairs.detect(decomp, ctx())).toBeNull();
  });

  it("does not fire on a kokushi decomposition", () => {
    expect(sevenPairs.detect(kokushi(pair("man", 1)), ctx())).toBeNull();
  });
});
