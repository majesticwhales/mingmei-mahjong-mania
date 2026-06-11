import { beforeEach, describe, expect, it } from "vitest";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { Game } from "../../../src/models/game.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

async function seedFaceUp(gameTeamId: string, gameNodeIds: string[]) {
  await GameLocationTeamVisibility.bulkCreate(
    gameNodeIds.map((gameNodeId) => ({
      gameTeamId,
      gameNodeId,
      isFaceUp: true,
      source: "phase" as const,
      revealedAt: new Date(),
    })),
  );
}

describe("buildGameStateProjection (phase-driven tile slots)", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("exposes only the slot matching the current visibility phase on the map", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a", "b"],
      nodeTilesByCode: { a: 3, b: 3 },
      slotsPerNode: 3,
      visibilityPhaseCount: 3,
      visibilityMode: "phase",
      slotUnlockOffsetsSeconds: [0, 0, 0],
      slotMapUnlockOffsetsSeconds: [0, 0, 0],
    });
    const participant = fixture.participants[0]!;
    const nodeIds = [...fixture.nodeIdByCode.values()];
    await seedFaceUp(participant.gameTeamId, nodeIds);

    await Game.update(
      { visibilityPhase: 1 },
      { where: { id: fixture.gameId } },
    );

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.visibilityPhase).toBe(1);
    expect(projection.visibilityPhaseCount).toBe(3);
    expect(projection.phaseDrivenSlotMap).toBe(true);
    for (const code of ["a", "b"] as const) {
      const node = projection.mapNodes.find((n) => n.code === code)!;
      expect(node.tiles).toHaveLength(1);
      expect(node.tiles![0]!.slotIndex).toBe(1);
    }
    expect(projection.atStation).toBeNull();
  });

  it("slot mode shows only slot 0 on the map at game start", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      nodeTilesByCode: { a: 3 },
      slotsPerNode: 3,
      visibilityPhaseCount: 3,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 3600, 7200],
      // Map reveal matches claim reveal — preserves the pre-Phase-L
      // "tile reveals on map when it becomes claimable" semantics.
      slotMapUnlockOffsetsSeconds: [0, 3600, 7200],
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: new Date() },
    );

    expect(projection.phaseDrivenSlotMap).toBe(false);
    const node = projection.mapNodes.find((n) => n.code === "a")!;
    expect(node.tiles?.map((t) => t.slotIndex)).toEqual([0]);
  });

  it("slot mode shows every tile at the checked-in station from the start", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      startNodeCodeBySlot: { 1: "a" },
      nodeTilesByCode: { a: 3 },
      slotsPerNode: 3,
      visibilityPhaseCount: 3,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 3600, 7200],
      slotMapUnlockOffsetsSeconds: [0, 3600, 7200],
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: new Date() },
    );

    expect(projection.atStation?.tiles?.map((t) => t.slotIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(
      projection.mapNodes.find((n) => n.code === "a")!.tiles?.map((t) => t.slotIndex),
    ).toEqual([0]);
  });

  it("slot mode adds map tiles as each slot unlocks", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["a"],
      nodeTilesByCode: { a: 3 },
      slotsPerNode: 3,
      visibilityPhaseCount: 3,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 60, 120],
      slotMapUnlockOffsetsSeconds: [0, 60, 120],
    });
    const game = await Game.findByPk(fixture.gameId);
    const startedAt = game!.startedAt;

    const atStart = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: startedAt },
    );
    expect(
      atStart.mapNodes.find((n) => n.code === "a")!.tiles?.map((t) => t.slotIndex),
    ).toEqual([0]);

    const afterSlot1 = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: new Date(startedAt.getTime() + 60_000) },
    );
    expect(
      afterSlot1.mapNodes.find((n) => n.code === "a")!.tiles?.map((t) => t.slotIndex),
    ).toEqual([0, 1]);
  });
});
