import { describe, expect, it } from "vitest";
import { doraTileFromIndicator, doraTileLabel, indicatorToDoraTileType } from "./dora";
import type { TileDto } from "../wire/projection";

function indicator(suit: string, rank: number): TileDto {
  return {
    instanceId: "indicator",
    suit,
    rank,
    copyIndex: 0,
    displayName: "Indicator",
    isRedFive: false,
  };
}

describe("indicatorToDoraTileType", () => {
  it.each(["man", "pin", "sou"] as const)("wraps numbered %s ranks", (suit) => {
    expect(indicatorToDoraTileType({ suit, rank: 1 })).toEqual({ suit, rank: 2 });
    expect(indicatorToDoraTileType({ suit, rank: 9 })).toEqual({ suit, rank: 1 });
  });

  it("wraps wind ranks East → South → … → East", () => {
    expect(indicatorToDoraTileType({ suit: "wind", rank: 1 })).toEqual({
      suit: "wind",
      rank: 2,
    });
    expect(indicatorToDoraTileType({ suit: "wind", rank: 4 })).toEqual({
      suit: "wind",
      rank: 1,
    });
  });

  it("wraps dragon ranks Red → White → Green → Red", () => {
    expect(indicatorToDoraTileType({ suit: "dragon", rank: 2 })).toEqual({
      suit: "dragon",
      rank: 3,
    });
    expect(indicatorToDoraTileType({ suit: "dragon", rank: 3 })).toEqual({
      suit: "dragon",
      rank: 1,
    });
  });
});

describe("doraTileFromIndicator", () => {
  it("derives the scoring dora from an indicator tile", () => {
    expect(doraTileFromIndicator(indicator("dragon", 2))).toEqual({
      suit: "dragon",
      rank: 3,
    });
  });
});

describe("doraTileLabel", () => {
  it("labels honour and numbered dora tiles", () => {
    expect(doraTileLabel({ suit: "pin", rank: 5 })).toBe("5 Circle");
    expect(doraTileLabel({ suit: "dragon", rank: 3 })).toBe("Green Dragon");
    expect(doraTileLabel({ suit: "wind", rank: 1 })).toBe("East Wind");
  });
});
