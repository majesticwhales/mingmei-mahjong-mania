import { describe, expect, it } from "vitest";
import {
  deriveAutoDistributedOffsets,
  offsetsMatchAutoDistribute,
  resizeSlotMapUnlockOffsets,
} from "./slotTier";

describe("deriveAutoDistributedOffsets", () => {
  it("returns [0] for a single slot", () => {
    expect(deriveAutoDistributedOffsets(1, 7200)).toEqual([0]);
  });

  it("spreads two slots across the duration", () => {
    expect(deriveAutoDistributedOffsets(2, 3600)).toEqual([0, 1800]);
  });

  it("spreads four slots across the duration", () => {
    expect(deriveAutoDistributedOffsets(4, 7200)).toEqual([0, 1800, 3600, 5400]);
  });

  it("rounds non-integer divisions", () => {
    // D=1000, n=3 → [0, round(333.33), round(666.66)] = [0, 333, 667]
    expect(deriveAutoDistributedOffsets(3, 1000)).toEqual([0, 333, 667]);
  });

  it("clamps invalid durations to zero", () => {
    expect(deriveAutoDistributedOffsets(3, -1)).toEqual([0, 0, 0]);
    expect(deriveAutoDistributedOffsets(3, NaN)).toEqual([0, 0, 0]);
  });
});

describe("offsetsMatchAutoDistribute", () => {
  it("matches an exact formula output", () => {
    expect(offsetsMatchAutoDistribute([0, 1800, 3600, 5400], 4, 7200)).toBe(true);
  });

  it("tolerates ±1s rounding drift", () => {
    expect(offsetsMatchAutoDistribute([0, 1799, 3601, 5400], 4, 7200)).toBe(true);
  });

  it("rejects custom offsets outside the tolerance", () => {
    expect(offsetsMatchAutoDistribute([0, 600, 1200, 1800], 4, 7200)).toBe(false);
  });

  it("rejects length mismatches", () => {
    expect(offsetsMatchAutoDistribute([0, 1800], 4, 7200)).toBe(false);
    expect(offsetsMatchAutoDistribute([0, 1800, 3600, 5400, 7000], 4, 7200)).toBe(false);
  });

  it("accepts trivial single-slot case", () => {
    expect(offsetsMatchAutoDistribute([0], 1, 7200)).toBe(true);
  });
});

describe("resizeSlotMapUnlockOffsets", () => {
  it("returns [0] for slotsPerNode = 1", () => {
    expect(resizeSlotMapUnlockOffsets([0], 1)).toEqual([0]);
    // Slot 0 invariant: even if the prior array had `null` or a positive
    // value, the resized slot 0 is always `0`.
    expect(resizeSlotMapUnlockOffsets([3600], 1)).toEqual([0]);
    expect(resizeSlotMapUnlockOffsets([null], 1)).toEqual([0]);
  });

  it("preserves existing numeric and null entries when growing", () => {
    expect(resizeSlotMapUnlockOffsets([0, 1800], 4)).toEqual([0, 1800, 0, 0]);
    expect(resizeSlotMapUnlockOffsets([0, null], 3)).toEqual([0, null, 0]);
  });

  it("trims trailing entries when shrinking", () => {
    expect(resizeSlotMapUnlockOffsets([0, 1800, 3600, null], 2)).toEqual([0, 1800]);
  });

  it("forces slot 0 to 0", () => {
    expect(resizeSlotMapUnlockOffsets([3600, null], 2)).toEqual([0, null]);
    expect(resizeSlotMapUnlockOffsets([null, 1800], 2)).toEqual([0, 1800]);
  });
});
