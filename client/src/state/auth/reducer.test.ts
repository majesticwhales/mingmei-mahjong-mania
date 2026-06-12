import { describe, expect, it } from "vitest";
import { authReducer } from "./reducer";

const user = {
  id: "u1",
  email: "a@b.c",
  username: "alice",
  isAdmin: false,
  createdAt: "2026-01-01",
};

describe("authReducer", () => {
  it("restores from token", () => {
    expect(authReducer({ status: "unknown" }, { type: "auth/restore", token: "t" })).toEqual({
      status: "unknown",
    });
  });

  it("handles login success", () => {
    expect(
      authReducer(
        { status: "anonymous" },
        { type: "auth/login/success", user, token: "tok", activeGameId: null },
      ),
    ).toEqual({ status: "authenticated", user, token: "tok", activeGameId: null });
  });

  it("logs out", () => {
    expect(
      authReducer(
        { status: "authenticated", user, token: "tok", activeGameId: null },
        { type: "auth/logout" },
      ),
    ).toEqual({ status: "anonymous" });
  });
});
