import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs with test env configured", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(process.env.DATABASE_URL).toMatch(/test/i);
  });
});
