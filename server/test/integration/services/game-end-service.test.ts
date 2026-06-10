import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../../src/models/game.ts";
import { endGameEarly } from "../../../src/services/game-end-service.ts";
import { registerUser, setUserAdmin } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupStartedGame } from "../../setup/game.ts";
import { bearer, getAgent } from "../../setup/http.ts";

describe("endGameEarly", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("ends an active game for an admin user", async () => {
    const { gameId, hostUserId } = await setupStartedGame();

    const result = await endGameEarly(gameId, hostUserId);
    expect(result.status).toBe("ended");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ended");
  });

  it("rejects non-admin users", async () => {
    const { gameId } = await setupStartedGame();
    const outsider = await registerUser();

    await expect(endGameEarly(gameId, outsider.user.id)).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("is idempotent when the game is already ended", async () => {
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);

    await expect(endGameEarly(gameId, hostUserId)).resolves.toEqual({
      status: "ended",
    });
  });
});

describe("POST /api/games/:id/end", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 403 for non-admin users", async () => {
    const agent = await getAgent();
    const { gameId } = await setupStartedGame();
    const outsider = await registerUser();

    const res = await agent
      .post(`/api/games/${gameId}/end`)
      .set(bearer(outsider.token));

    expect(res.status).toBe(403);
  });

  it("ends the game for admin users", async () => {
    const agent = await getAgent();
    const { gameId, hostUserId } = await setupStartedGame();
    const admin = await registerUser();
    await setUserAdmin(admin.user.id);

    const res = await agent
      .post(`/api/games/${gameId}/end`)
      .set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ended");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ended");
    expect(hostUserId).toBeTruthy();
  });
});
