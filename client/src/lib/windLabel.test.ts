import { describe, expect, it } from "vitest";
import { windRankImagePath, windRankLabel } from "./windLabel";

describe("windRankLabel", () => {
  it("maps ranks 1–4 to compass winds", () => {
    expect(windRankLabel(1)).toBe("East");
    expect(windRankLabel(2)).toBe("South");
    expect(windRankLabel(3)).toBe("West");
    expect(windRankLabel(4)).toBe("North");
  });

  it("returns a placeholder for out-of-range ranks", () => {
    expect(windRankLabel(0)).toBe("—");
    expect(windRankLabel(5)).toBe("—");
  });
});

describe("windRankImagePath", () => {
  it("maps ranks 1–4 to wind tile assets", () => {
    expect(windRankImagePath(1)).toContain("Ton.svg");
    expect(windRankImagePath(2)).toContain("Nan.svg");
    expect(windRankImagePath(3)).toContain("Shaa.svg");
    expect(windRankImagePath(4)).toContain("Pei.svg");
  });
});
