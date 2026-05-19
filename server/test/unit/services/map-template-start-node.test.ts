import { describe, expect, it } from "vitest";
import { normalizeStartNodeCode } from "../../../src/services/map-template-start-node.ts";

describe("normalizeStartNodeCode", () => {
  it("trims and lowercases station codes", () => {
    expect(normalizeStartNodeCode("  BAY  ")).toBe("bay");
    expect(normalizeStartNodeCode("Union")).toBe("union");
  });
});
