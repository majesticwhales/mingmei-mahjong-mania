import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../../src/models/game.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { endGameEarly } from "../../../src/services/game-end-service.ts";
import { registerUser, setUserAdmin } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame, setupStartedGame } from "../../setup/game.ts";
import { bearer, getAgent } from "../../setup/http.ts";

describe("endGameEarly", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("ends an active game for an admin user", async () => {
    const { gameId, hostUserId } = await setupStartedGame();

    const result = await endGameEarly(gameId, hostUserId);
    expect(result.status).toBe("ending");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ending");
  });

  it("rejects non-admin users", async () => {
    const { gameId } = await setupStartedGame();
    const outsider = await registerUser();

    await expect(endGameEarly(gameId, outsider.user.id)).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("is idempotent when the game is already in wrap-up or ended", async () => {
    const { gameId, hostUserId } = await setupStartedGame();
    await endGameEarly(gameId, hostUserId);

    await expect(endGameEarly(gameId, hostUserId)).resolves.toEqual({
      status: "ending",
    });
  });

  // Reason-precedence coverage for the admin-driven path. Mirrors the
  // scheduler-tick cases in `system-handlers.test.ts`; together they pin
  // the three-value enum: `all_teams_completed` (every team claimed)
  // wins over the trigger, otherwise the trigger decides between
  // `manual` (this path) and `timer` (scheduler).
  it("emits endReason='manual' when an admin ends a game with incomplete teams", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 0,
    });
    // `setupLightweightGame` registers the host but doesn't elevate; the
    // admin guard inside `endGameEarly` is what we're actually testing
    // for the alternate paths, so register a dedicated admin here rather
    // than mutating the host's role.
    const admin = await registerUser();
    await setUserAdmin(admin.user.id);

    await endGameEarly(fixture.gameId, admin.user.id);

    const events = await GameEvent.findAll({ where: { gameId: fixture.gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("GAME_ENDED");
    expect(events[0]!.payload).toMatchObject({ endReason: "manual" });
  });

  it("emits endReason='all_teams_completed' when an admin ends a game where every team already claimed", async () => {
    // `markTeamHandCompleted` stamps `handCompletedAt` on every team,
    // which is the precondition that beats the manual trigger. The
    // natural label is more informative than "manual end", so the
    // precedence rule keeps it.
    const fixture = await setupLightweightGame({
      participantCount: 0,
      nodeCodes: ["x"],
      handTilesBySlot: { 1: 1, 2: 1, 3: 1, 4: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 1000 },
        { slot: 2, finalPoints: 5000 },
        { slot: 3, finalPoints: 2000 },
        { slot: 4, finalPoints: 3000 },
      ],
    });
    const admin = await registerUser();
    await setUserAdmin(admin.user.id);

    await endGameEarly(fixture.gameId, admin.user.id);

    const events = await GameEvent.findAll({ where: { gameId: fixture.gameId } });
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({
      endReason: "all_teams_completed",
      winningGameTeamId: fixture.gameTeamIdBySlot.get(2)!,
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
    expect(res.body.status).toBe("ending");

    const game = await Game.findByPk(gameId);
    expect(game?.status).toBe("ending");
    expect(hostUserId).toBeTruthy();
  });
});
