import { describe, expect, it } from "vitest";
import { authedHomePath } from "./authedHome";

const user = {
  id: "u1",
  email: "a@b.c",
  username: "alice",
  isAdmin: false,
  createdAt: "2026-01-01",
};

describe("authedHomePath", () => {
  it("sends anonymous users to login", () => {
    expect(authedHomePath({ status: "anonymous" })).toBe("/login");
  });

  it("sends authed users without a game to lobbies", () => {
    expect(
      authedHomePath({
        status: "authenticated",
        user,
        token: "tok",
        activeGameId: null,
      }),
    ).toBe("/lobbies");
  });

  it("sends authed users with an active game into that game", () => {
    expect(
      authedHomePath({
        status: "authenticated",
        user,
        token: "tok",
        activeGameId: "game-42",
      }),
    ).toBe("/games/game-42");
  });
});
