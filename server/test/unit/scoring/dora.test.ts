import { describe, expect, it } from "vitest";

import {
  type DoraIndicator,
  countDora,
  indicatorToDoraTileType,
} from "../../../src/scoring/dora.ts";
import {
  DRAGON_GREEN,
  DRAGON_RED,
  DRAGON_WHITE,
  type Tile,
  WIND_EAST,
  WIND_NORTH,
  WIND_SOUTH,
  WIND_WEST,
} from "../../../src/scoring/types.ts";

function tile(suit: Tile["suit"], rank: number, copyIndex = 0): Tile {
  return { suit, rank, copyIndex };
}

describe("indicatorToDoraTileType", () => {
  describe("numbered suits", () => {
    it.each(["man", "pin", "sou"] as const)(
      "%s rank advances 1 → 2 → … → 9 → 1",
      (suit) => {
        for (let rank = 1; rank <= 8; rank += 1) {
          expect(indicatorToDoraTileType({ suit, rank })).toEqual({
            suit,
            rank: rank + 1,
          });
        }
        // 9 wraps back to 1.
        expect(indicatorToDoraTileType({ suit, rank: 9 })).toEqual({
          suit,
          rank: 1,
        });
      },
    );
  });

  describe("winds", () => {
    it.each<[number, number]>([
      [WIND_EAST, WIND_SOUTH],
      [WIND_SOUTH, WIND_WEST],
      [WIND_WEST, WIND_NORTH],
      [WIND_NORTH, WIND_EAST],
    ])("indicator wind %s → dora wind %s", (indicatorRank, expectedRank) => {
      expect(
        indicatorToDoraTileType({ suit: "wind", rank: indicatorRank }),
      ).toEqual({ suit: "wind", rank: expectedRank });
    });
  });

  describe("dragons", () => {
    it.each<[number, number]>([
      [DRAGON_RED, DRAGON_WHITE],
      [DRAGON_WHITE, DRAGON_GREEN],
      [DRAGON_GREEN, DRAGON_RED],
    ])(
      "indicator dragon %s → dora dragon %s (Red→White→Green→Red)",
      (indicatorRank, expectedRank) => {
        expect(
          indicatorToDoraTileType({ suit: "dragon", rank: indicatorRank }),
        ).toEqual({ suit: "dragon", rank: expectedRank });
      },
    );
  });

  describe("validation", () => {
    it("throws on out-of-range numbered rank", () => {
      expect(() =>
        indicatorToDoraTileType({ suit: "man", rank: 0 }),
      ).toThrow(/Invalid rank/);
      expect(() =>
        indicatorToDoraTileType({ suit: "pin", rank: 10 }),
      ).toThrow(/Invalid rank/);
    });

    it("throws on out-of-range wind / dragon rank", () => {
      expect(() =>
        indicatorToDoraTileType({ suit: "wind", rank: 5 }),
      ).toThrow(/Invalid rank/);
      expect(() =>
        indicatorToDoraTileType({ suit: "dragon", rank: 4 }),
      ).toThrow(/Invalid rank/);
    });

    it("throws on non-integer rank", () => {
      expect(() =>
        indicatorToDoraTileType({ suit: "sou", rank: 2.5 }),
      ).toThrow(/Invalid rank/);
    });

    it("throws on unrecognised suit", () => {
      expect(() =>
        indicatorToDoraTileType({
          suit: "rabbit" as unknown as DoraIndicator["suit"],
          rank: 1,
        }),
      ).toThrow(/Unrecognised suit/);
    });
  });
});

describe("countDora", () => {
  it("returns 0 when no indicators are revealed", () => {
    const tiles = [tile("man", 5), tile("pin", 5), tile("sou", 5)];
    expect(countDora(tiles, [])).toBe(0);
  });

  it("counts every hand tile whose (suit, rank) matches the dora type", () => {
    // Indicator 4p → dora 5p. Hand has three 5p tiles.
    const tiles = [
      tile("pin", 5, 0),
      tile("pin", 5, 1),
      tile("pin", 5, 2),
      tile("pin", 8),
    ];
    const indicators: DoraIndicator[] = [{ suit: "pin", rank: 4 }];
    expect(countDora(tiles, indicators)).toBe(3);
  });

  it("ignores copyIndex (every copy of the matching tile type counts)", () => {
    const indicators: DoraIndicator[] = [{ suit: "man", rank: 1 }]; // dora 2m
    const tiles = [tile("man", 2, 0), tile("man", 2, 3)];
    expect(countDora(tiles, indicators)).toBe(2);
  });

  it("stacks independently when multiple indicators are revealed", () => {
    // Two indicators that happen to map to the same dora type
    // (4p both times → 5p) should each count.
    const indicators: DoraIndicator[] = [
      { suit: "pin", rank: 4 },
      { suit: "pin", rank: 4 },
    ];
    const tiles = [tile("pin", 5, 0), tile("pin", 5, 1)];
    // Two indicators × two matching tiles = 4 han.
    expect(countDora(tiles, indicators)).toBe(4);
  });

  it("returns 0 when no hand tile matches the dora type", () => {
    const indicators: DoraIndicator[] = [
      { suit: "dragon", rank: DRAGON_RED }, // dora = White
    ];
    const tiles = [tile("man", 5), tile("dragon", DRAGON_RED)];
    expect(countDora(tiles, indicators)).toBe(0);
  });

  it("handles a mixed indicator list across suits", () => {
    const indicators: DoraIndicator[] = [
      { suit: "man", rank: 9 }, // dora = 1m
      { suit: "wind", rank: WIND_NORTH }, // dora = East
      { suit: "dragon", rank: DRAGON_GREEN }, // dora = Red
    ];
    const tiles = [
      tile("man", 1, 0),
      tile("man", 1, 1),
      tile("wind", WIND_EAST),
      tile("dragon", DRAGON_RED),
      tile("dragon", DRAGON_WHITE),
    ];
    // 2 (1m) + 1 (East) + 1 (Red Dragon) = 4.
    expect(countDora(tiles, indicators)).toBe(4);
  });
});
