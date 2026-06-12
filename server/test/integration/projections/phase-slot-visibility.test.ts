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

  it("accumulates revealed slots across visibility phases — phase k exposes [0..k]", async () => {
    // Tier 1 (slot 0) is visible throughout the game; phase 1 adds
    // Tier 2 (slot 1) without hiding Tier 1; phase 2 would add Tier 3.
    // This replaces the pre-2026-06-11 "each phase shows exactly one
    // slot" behaviour, which made the previous tier vanish at each
    // breakpoint.
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
    // Phase L §3.13: `phaseDrivenSlotMap` is telemetry — the UI must
    // read `tiles[].visible` directly.
    expect(projection.phaseDrivenSlotMap).toBe(true);
    for (const code of ["a", "b"] as const) {
      const node = projection.mapNodes.find((n) => n.code === code)!;
      expect(node.tiles).toHaveLength(3);
      expect(node.tiles.map((t) => t.slotIndex)).toEqual([0, 1, 2]);
      // Cumulative reveal: slots 0 (Tier 1) and 1 (Tier 2) are
      // visible at phase 1; slot 2 (Tier 3) waits for phase 2.
      expect(node.tiles.map((t) => t.visible)).toEqual([true, true, false]);
      // mode = "phase" → slot layer off → `locked` is false everywhere.
      expect(node.tiles.map((t) => t.locked)).toEqual([false, false, false]);
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
    // Phase L §3.13: all three slots are emitted; the claim + map
    // timers gate `visible` / `locked` (slot 1, 2 still hidden +
    // locked at game start).
    expect(node.tiles).toHaveLength(3);
    expect(node.tiles.map((t) => t.visible)).toEqual([true, false, false]);
    expect(node.tiles.map((t) => t.locked)).toEqual([false, true, true]);
  });

  it("slot mode: atStation mirrors mapNodes[teamNode] from the start (Phase L B-2 — no at-station privilege)", async () => {
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

    const aNode = projection.mapNodes.find((n) => n.code === "a")!;
    expect(aNode.tiles.map((t) => t.visible)).toEqual([true, false, false]);
    expect(aNode.tiles.map((t) => t.locked)).toEqual([false, true, true]);
    // atStation is the same per-slot view as the team's mapNodes entry
    // — slots 1 and 2 are hidden-and-locked, not pre-revealed.
    expect(projection.atStation?.tiles).toEqual(aNode.tiles);
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
    const atStartNode = atStart.mapNodes.find((n) => n.code === "a")!;
    expect(atStartNode.tiles.map((t) => t.visible)).toEqual([
      true,
      false,
      false,
    ]);
    expect(atStartNode.tiles.map((t) => t.locked)).toEqual([
      false,
      true,
      true,
    ]);

    const afterSlot1 = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: new Date(startedAt.getTime() + 60_000) },
    );
    const afterSlot1Node = afterSlot1.mapNodes.find((n) => n.code === "a")!;
    expect(afterSlot1Node.tiles.map((t) => t.visible)).toEqual([
      true,
      true,
      false,
    ]);
    expect(afterSlot1Node.tiles.map((t) => t.locked)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
