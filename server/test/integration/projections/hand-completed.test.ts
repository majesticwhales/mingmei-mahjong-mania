import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendEvent } from "../../../src/engine/event-log.ts";
import { sequelize } from "../../../src/config/database.ts";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { serializeGameEvent } from "../../../src/projections/recent-events.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Phase J coverage for the projection-layer additions:
 *
 *   - `handCompleted` populated only on the requesting team's projection.
 *   - `teamsCompleted` listing every completed team (public roster).
 *   - `atStation` short-circuited to `null` when the requesting team is
 *     hand-completed.
 *   - `recentEvents[].finalPoints` lifted on `CLAIM_WIN` rows only for
 *     the claiming team's projection, and stripped on every other team's
 *     projection (per-team redaction).
 *   - `serializeGameEvent` (live `game.event` broadcast) never carries
 *     `finalPoints` regardless of actor.
 *
 * Uses `markTeamHandCompleted` from the lightweight fixture to seed
 * completed teams without exercising the full `CLAIM_WIN` engine flow.
 * The `CLAIM_WIN` event row used for the redaction test is appended
 * directly through `appendEvent` for the same reason — the projection's
 * lift logic only cares about the row shape, not the handler that
 * produced it.
 */
describe("buildGameStateProjection - Phase J hand-completed", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("populates handCompleted on the requesting team's projection only", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: [
        {
          slot: 1,
          finalHan: 3,
          finalFu: 40,
          finalPoints: 5200,
          finalYakuKeys: [
            { name: "Riichi", han: 1 },
            { name: "Pinfu", han: 1 },
            { name: "Tsumo", han: 1 },
          ],
        },
      ],
    });

    const teamA = fixture.participants[0]!;
    const teamB = fixture.participants[1]!;

    const projectionA = await buildGameStateProjection(
      fixture.gameId,
      teamA.gameTeamId,
    );
    const projectionB = await buildGameStateProjection(
      fixture.gameId,
      teamB.gameTeamId,
    );

    expect(projectionA.handCompleted).not.toBeNull();
    expect(projectionA.handCompleted!.finalHan).toBe(3);
    expect(projectionA.handCompleted!.finalFu).toBe(40);
    expect(projectionA.handCompleted!.finalPoints).toBe(5200);
    expect(projectionA.handCompleted!.finalYaku).toEqual([
      { name: "Riichi", han: 1 },
      { name: "Pinfu", han: 1 },
      { name: "Tsumo", han: 1 },
    ]);
    expect(projectionA.handCompleted!.winningNodeCode).toBe("bay");
    expect(projectionA.handCompleted!.winningNodeName).toBe("bay");
    // Winning tile is the team's first hand tile per the fixture's pinning
    // rule.
    expect(projectionA.handCompleted!.winningTile.instanceId).toBe(
      fixture.handTiles[0]!.gameTileId,
    );

    expect(projectionB.handCompleted).toBeNull();
  });

  it("lists every completed team in teamsCompleted, sorted by completedAt ASC", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "queen"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
      handTilesBySlot: { 1: 1, 3: 1 },
      markTeamHandCompleted: [
        { slot: 1, finalPoints: 3900 },
        { slot: 3, finalPoints: 8000 },
      ],
    });

    const teamA = fixture.participants[0]!;
    const projection = await buildGameStateProjection(
      fixture.gameId,
      teamA.gameTeamId,
    );

    expect(projection.teamsCompleted).toHaveLength(2);
    // Fixture stamps `completedAt` 1ms apart in entry order, so slot 1
    // appears before slot 3.
    expect(projection.teamsCompleted[0]!.gameTeamId).toBe(
      fixture.gameTeamIdBySlot.get(1),
    );
    expect(projection.teamsCompleted[1]!.gameTeamId).toBe(
      fixture.gameTeamIdBySlot.get(3),
    );
    expect(projection.teamsCompleted[0]!.teamCode).toBe("east");
    expect(projection.teamsCompleted[1]!.teamCode).toBe("west");
    expect(
      new Date(projection.teamsCompleted[0]!.completedAt).getTime(),
    ).toBeLessThan(
      new Date(projection.teamsCompleted[1]!.completedAt).getTime(),
    );
  });

  it("returns an empty teamsCompleted list when no teams have completed", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const projection = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
    );
    expect(projection.teamsCompleted).toEqual([]);
    expect(projection.handCompleted).toBeNull();
  });

  it("short-circuits atStation to null for the completed team but keeps it for others", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      markTeamHandCompleted: 1,
    });

    const teamA = fixture.participants[0]!;
    const teamB = fixture.participants[1]!;

    const projectionA = await buildGameStateProjection(
      fixture.gameId,
      teamA.gameTeamId,
    );
    const projectionB = await buildGameStateProjection(
      fixture.gameId,
      teamB.gameTeamId,
    );

    expect(projectionA.atStation).toBeNull();
    expect(projectionB.atStation).not.toBeNull();
    expect(projectionB.atStation!.code).toBe("bay");
  });
});

describe("buildGameStateProjection - Phase J finalPoints redaction", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("lifts finalPoints only on the claiming team's projection", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: [{ slot: 1, finalPoints: 7700 }],
    });
    const teamA = fixture.participants[0]!;
    const teamB = fixture.participants[1]!;

    await sequelize.transaction(async (transaction) => {
      await appendEvent(transaction, {
        gameId: fixture.gameId,
        eventType: "CLAIM_WIN",
        actorGameTeamId: teamA.gameTeamId,
        actorUserId: teamA.userId,
        payload: {
          nodeCode: "bay",
          slotIndex: 0,
          finalHan: 2,
          finalFu: 30,
          finalPoints: 7700,
          finalYaku: [{ name: "Riichi", han: 1 }],
        },
      });
    });

    const projectionA = await buildGameStateProjection(
      fixture.gameId,
      teamA.gameTeamId,
    );
    const projectionB = await buildGameStateProjection(
      fixture.gameId,
      teamB.gameTeamId,
    );

    const claimA = projectionA.recentEvents.find((e) => e.type === "CLAIM_WIN");
    const claimB = projectionB.recentEvents.find((e) => e.type === "CLAIM_WIN");

    expect(claimA?.finalPoints).toBe(7700);
    expect(claimB).toBeDefined();
    expect(claimB?.finalPoints).toBeUndefined();
    // Other public fields lift unconditionally.
    expect(claimB?.nodeCode).toBe("bay");
    expect(claimB?.slotIndex).toBe(0);
  });

  it("never lifts finalPoints on the public live game.event broadcast", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const teamA = fixture.participants[0]!;

    await sequelize.transaction(async (transaction) => {
      await appendEvent(transaction, {
        gameId: fixture.gameId,
        eventType: "CLAIM_WIN",
        actorGameTeamId: teamA.gameTeamId,
        actorUserId: teamA.userId,
        payload: { nodeCode: "bay", finalPoints: 12000 },
      });
    });

    const event = await GameEvent.findOne({
      where: { gameId: fixture.gameId, eventType: "CLAIM_WIN" },
    });
    expect(event).not.toBeNull();
    const dto = await serializeGameEvent(event!);
    expect(dto.type).toBe("CLAIM_WIN");
    expect(dto.nodeCode).toBe("bay");
    expect(dto.finalPoints).toBeUndefined();
  });
});
