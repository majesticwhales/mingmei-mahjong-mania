import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../../src/auth/password.ts";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
