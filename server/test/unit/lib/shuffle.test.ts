import { afterEach, describe, expect, it, vi } from "vitest";
import { shuffleInPlace } from "../../../src/lib/shuffle.ts";

describe("shuffleInPlace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves elements as a permutation", () => {
    const items = [1, 2, 3, 4, 5];
    const before = [...items];
    shuffleInPlace(items);
    expect(items.sort()).toEqual(before.sort());
    expect(items).toHaveLength(before.length);
  });

  it("can reorder elements when randomness varies", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValueOnce(0.99).mockReturnValueOnce(0).mockReturnValue(0);

    const items = ["a", "b", "c"];
    shuffleInPlace(items);

    expect(items).not.toEqual(["a", "b", "c"]);
  });
});
