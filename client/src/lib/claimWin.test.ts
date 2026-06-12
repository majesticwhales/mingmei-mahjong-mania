import { describe, expect, it } from "vitest";
import { stationHasClaimableWait, waitMatchesTile } from "./claimWin";

describe("claimWin helpers", () => {
  it("matches waits by suit and rank regardless of copyIndex", () => {
    expect(
      waitMatchesTile(
        { tile: { suit: "pin", rank: 5, copyIndex: 0 } },
        { suit: "pin", rank: 5 },
      ),
    ).toBe(true);
    expect(
      waitMatchesTile(
        { tile: { suit: "pin", rank: 5, copyIndex: 0 } },
        { suit: "pin", rank: 8 },
      ),
    ).toBe(false);
  });

  it("detects claimable station slots from wait types", () => {
    expect(
      stationHasClaimableWait(
        [
          {
            slotIndex: 0,
            tile: {
              suit: "sou",
              rank: 9,
              copyIndex: 3,
              instanceId: "x",
              displayName: "sou9",
              isRedFive: false,
            },
            visible: true,
            locked: false,
          },
        ],
        [{ tile: { suit: "sou", rank: 9, copyIndex: 0 }, han: 1, fu: 30, points: 1000, yaku: [], isYakuman: false }],
      ),
    ).toBe(true);
  });

  it("skips hidden / locked station slots (tile === null) when filtering for claimable waits", () => {
    // Phase L Chunk 4 B-2: locked or map-fogged slots arrive with
    // `tile: null`. They must never count as claimable, even when a
    // wait would otherwise match the slot's underlying tile type.
    expect(
      stationHasClaimableWait(
        [
          { slotIndex: 0, tile: null, visible: false, locked: true },
        ],
        [{ tile: { suit: "sou", rank: 9, copyIndex: 0 }, han: 1, fu: 30, points: 1000, yaku: [], isYakuman: false }],
      ),
    ).toBe(false);
  });
});
