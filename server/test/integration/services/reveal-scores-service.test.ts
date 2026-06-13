import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../../src/models/game.ts";
import { endGameEarly } from "../../../src/services/game-end-service.ts";
import { revealGameScores } from "../../../src/services/reveal-scores-service.ts";
import { registerUser, setUserAdmin } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupStartedGame } from "../../setup/game.ts";
import { bearer, getAgent } from "../../setup/http.ts";

describe("revealGameScores", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("reveals scores for an admin once the game is in wrap-up", async () => {
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);

    const result = await revealGameScores(gameId, hostUserId);
    expect(result.status).toBe("ended");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ended");
  });

  it("rejects non-admin users", async () => {
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);
    const outsider = await registerUser();

    await expect(revealGameScores(gameId, outsider.user.id)).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("is idempotent when scores were already revealed", async () => {
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);
    await revealGameScores(gameId, hostUserId);

    await expect(revealGameScores(gameId, hostUserId)).resolves.toEqual({
      status: "ended",
    });
  });
});

describe("POST /api/games/:id/reveal-scores", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 403 for non-admin users", async () => {
    const agent = await getAgent();
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);
    const outsider = await registerUser();

    const res = await agent
      .post(`/api/games/${gameId}/reveal-scores`)
      .set(bearer(outsider.token));

    expect(res.status).toBe(403);
    expect(hostUserId).toBeTruthy();
  });

  it("reveals scores for admin users", async () => {
    const agent = await getAgent();
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);
    const admin = await registerUser();
    await setUserAdmin(admin.user.id);

    const res = await agent
      .post(`/api/games/${gameId}/reveal-scores`)
      .set(bearer(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ended");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ended");
  });
});
