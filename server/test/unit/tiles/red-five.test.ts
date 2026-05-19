import { describe, expect, it } from "vitest";
import {
  isRedFiveForGame,
  isRedFiveTileIdentity,
} from "../../../src/tiles/red-five.ts";

describe("isRedFiveTileIdentity", () => {
  it("treats copy 0 of each suited 5 as red-five tiles", () => {
    expect(isRedFiveTileIdentity({ suit: "man", rank: 5, copyIndex: 0 })).toBe(
      true,
    );
    expect(isRedFiveTileIdentity({ suit: "pin", rank: 5, copyIndex: 0 })).toBe(
      true,
    );
    expect(isRedFiveTileIdentity({ suit: "sou", rank: 5, copyIndex: 0 })).toBe(
      true,
    );
  });

  it("does not treat other copies or suits as red-five", () => {
    expect(isRedFiveTileIdentity({ suit: "man", rank: 5, copyIndex: 1 })).toBe(
      false,
    );
    expect(isRedFiveTileIdentity({ suit: "honor", rank: 5, copyIndex: 0 })).toBe(
      false,
    );
  });
});

describe("isRedFiveForGame", () => {
  const red5m = { suit: "man", rank: 5, copyIndex: 0 };

  it("respects the game rule flag", () => {
    expect(isRedFiveForGame(red5m, true)).toBe(true);
    expect(isRedFiveForGame(red5m, false)).toBe(false);
  });
});
