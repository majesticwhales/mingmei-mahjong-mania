import { describe, expect, it } from "vitest";

import { computePoints } from "../../../src/scoring/score.ts";

/**
 * All values verified against the canonical riichi scoring table for
 * **non-dealer tsumo**. Note that per-payer round-up gives slightly
 * different totals than non-dealer ron in the sub-mangan range, e.g.
 * 1-han 30-fu ron = 1000 but tsumo = 1100 because the dealer's `2 × base`
 * and each non-dealer's `base` are rounded up independently.
 */
describe("computePoints — sub-mangan han/fu table (non-dealer tsumo)", () => {
  it("1 han 30 fu → 1100 (300/500)", () => {
    expect(computePoints({ han: 1, fu: 30, yakumanCount: 0 })).toBe(1100);
  });

  it("1 han 40 fu → 1500 (400/700)", () => {
    expect(computePoints({ han: 1, fu: 40, yakumanCount: 0 })).toBe(1500);
  });

  it("2 han 30 fu → 2000 (500/1000)", () => {
    expect(computePoints({ han: 2, fu: 30, yakumanCount: 0 })).toBe(2000);
  });

  it("2 han 40 fu → 2700 (700/1300)", () => {
    expect(computePoints({ han: 2, fu: 40, yakumanCount: 0 })).toBe(2700);
  });

  it("3 han 30 fu → 4000 (1000/2000)", () => {
    expect(computePoints({ han: 3, fu: 30, yakumanCount: 0 })).toBe(4000);
  });

  it("3 han 60 fu → 7900 (2000/3900)", () => {
    expect(computePoints({ han: 3, fu: 60, yakumanCount: 0 })).toBe(7900);
  });

  it("4 han 25 fu (chiitoitsu) → 6400 (1600/3200)", () => {
    expect(computePoints({ han: 4, fu: 25, yakumanCount: 0 })).toBe(6400);
  });

  it("4 han 30 fu → 7900 (2000/3900)", () => {
    expect(computePoints({ han: 4, fu: 30, yakumanCount: 0 })).toBe(7900);
  });
});

describe("computePoints — mangan ceiling", () => {
  it("3 han 70 fu hits the mangan ceiling → 8000", () => {
    // base = 70 * 32 = 2240, capped at 2000 → mangan
    expect(computePoints({ han: 3, fu: 70, yakumanCount: 0 })).toBe(8000);
  });

  it("4 han 40 fu hits the mangan ceiling → 8000", () => {
    // base = 40 * 64 = 2560, capped at 2000 → mangan
    expect(computePoints({ han: 4, fu: 40, yakumanCount: 0 })).toBe(8000);
  });
});

describe("computePoints — fixed-base tiers (mangan and above)", () => {
  it("5 han (any fu) → 8000 (mangan)", () => {
    expect(computePoints({ han: 5, fu: 30, yakumanCount: 0 })).toBe(8000);
    expect(computePoints({ han: 5, fu: 110, yakumanCount: 0 })).toBe(8000);
  });

  it("6 han → 12000 (haneman)", () => {
    expect(computePoints({ han: 6, fu: 30, yakumanCount: 0 })).toBe(12000);
  });

  it("7 han → 12000 (haneman)", () => {
    expect(computePoints({ han: 7, fu: 30, yakumanCount: 0 })).toBe(12000);
  });

  it("8 han → 16000 (baiman)", () => {
    expect(computePoints({ han: 8, fu: 30, yakumanCount: 0 })).toBe(16000);
  });

  it("10 han → 16000 (baiman)", () => {
    expect(computePoints({ han: 10, fu: 30, yakumanCount: 0 })).toBe(16000);
  });

  it("11 han → 24000 (sanbaiman)", () => {
    expect(computePoints({ han: 11, fu: 30, yakumanCount: 0 })).toBe(24000);
  });

  it("12 han → 24000 (sanbaiman)", () => {
    expect(computePoints({ han: 12, fu: 30, yakumanCount: 0 })).toBe(24000);
  });

  it("13 han (counted yakuman, no actual yakuman) → 32000", () => {
    expect(computePoints({ han: 13, fu: 30, yakumanCount: 0 })).toBe(32000);
  });

  it("20 han (counted yakuman, capped at single yakuman) → 32000", () => {
    expect(computePoints({ han: 20, fu: 30, yakumanCount: 0 })).toBe(32000);
  });
});

describe("computePoints — yakuman path", () => {
  it("single yakuman → 32000", () => {
    expect(computePoints({ han: 13, fu: 0, yakumanCount: 1 })).toBe(32000);
  });

  it("double yakuman (stacked) → 64000", () => {
    expect(computePoints({ han: 26, fu: 0, yakumanCount: 2 })).toBe(64000);
  });

  it("triple yakuman → 96000", () => {
    expect(computePoints({ han: 39, fu: 0, yakumanCount: 3 })).toBe(96000);
  });

  it("yakumanCount takes precedence over han: yakumanCount=1 with han=8 still routes to yakuman", () => {
    // Defensive: yakumanCount=1 always wins regardless of han total.
    expect(computePoints({ han: 8, fu: 0, yakumanCount: 1 })).toBe(32000);
  });
});

describe("computePoints — degenerate inputs", () => {
  it("returns 0 for a 0-han hand", () => {
    expect(computePoints({ han: 0, fu: 30, yakumanCount: 0 })).toBe(0);
  });
});
