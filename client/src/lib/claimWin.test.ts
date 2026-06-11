import { describe, expect, it } from "vitest";
import { stationHasClaimableWait, waitMatchesTile } from "./claimWin";

describe("claimWin helpers", () => {
  it("matches waits by suit and rank regardless of copyIndex", () => {
    expect(
      waitMatchesTile(
        { tile: { suit: "pin", rank: 5, copyIndex: 0 } },
        { suit: "pin", rank: 5, copyIndex: 2 },
      ),
    ).toBe(true);
    expect(
      waitMatchesTile(
        { tile: { suit: "pin", rank: 5, copyIndex: 0 } },
        { suit: "pin", rank: 8, copyIndex: 0 },
      ),
    ).toBe(false);
  });

  it("detects claimable station slots from wait types", () => {
    expect(
      stationHasClaimableWait(
        [{ slotIndex: 0, tile: { suit: "sou", rank: 9, copyIndex: 3, instanceId: "x", displayName: "sou9", isRedFive: false } }],
        [{ tile: { suit: "sou", rank: 9, copyIndex: 0 }, han: 1, fu: 30, points: 1000, yaku: [], isYakuman: false }],
      ),
    ).toBe(true);
  });
});
