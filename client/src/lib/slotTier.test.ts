import { describe, expect, it } from "vitest";
import {
  deriveAutoDistributedOffsets,
  offsetsMatchAutoDistribute,
  resizeSlotMapVisible,
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

describe("resizeSlotMapVisible", () => {
  it("returns [true] for slotsPerNode = 1", () => {
    expect(resizeSlotMapVisible([true], 1)).toEqual([true]);
    expect(resizeSlotMapVisible([false], 1)).toEqual([true]);
  });

  it("preserves existing entries when growing", () => {
    expect(resizeSlotMapVisible([true, false], 4)).toEqual([true, false, true, true]);
  });

  it("trims trailing entries when shrinking", () => {
    expect(resizeSlotMapVisible([true, false, true, true], 2)).toEqual([true, false]);
  });

  it("forces slot 0 to true", () => {
    expect(resizeSlotMapVisible([false, false], 2)).toEqual([true, false]);
  });
});
