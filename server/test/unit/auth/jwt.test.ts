import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "../../../src/auth/jwt.ts";

describe("jwt", () => {
  it("round-trips user id in access token", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const token = signAccessToken(userId);
    expect(verifyAccessToken(token).sub).toBe(userId);
  });

  it("rejects tampered tokens", () => {
    const token = signAccessToken("user-a");
    const bad = `${token}x`;
    expect(() => verifyAccessToken(bad)).toThrow(jwt.JsonWebTokenError);
  });
});
