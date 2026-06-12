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

  it("slot mode: atStation matches mapNodes[teamNode] when claim and map timers coincide", async () => {
    // With `slot_unlock_offsets_seconds === slot_map_unlock_offsets_seconds`
    // the at-station privilege has nothing to flip — every claim-locked
    // slot is also map-hidden and every claim-unlocked slot is also
    // map-revealed.
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
    expect(projection.atStation?.tiles).toEqual(aNode.tiles);
  });

  it("at-station privilege: claim-unlocked slots reveal at the team's station before the map timer fires (TDD §3.3 Tier 2 spec)", async () => {
    // Tier 2 tile: claim timer at t=0 (claimable from start), map
    // timer at t=3600 (hidden from the map until 60 min). When the
    // team is at their station, the at-station privilege flips slot 1
    // to `visible: true` even though the map view still says hidden.
    const fixture = await setupLightweightGame({
      nodeCodes: ["a", "b"],
      startNodeCodeBySlot: { 1: "a" },
      nodeTilesByCode: { a: 3, b: 3 },
      slotsPerNode: 3,
      visibilityPhaseCount: 3,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 0, 3600],
      slotMapUnlockOffsetsSeconds: [0, 3600, 7200],
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      fixture.participants[0]!.gameTeamId,
      { now: new Date() },
    );

    const aNode = projection.mapNodes.find((n) => n.code === "a")!;
    const bNode = projection.mapNodes.find((n) => n.code === "b")!;
    // Map view (everyone, all nodes): only Tier 1 (slot 0) is map-visible.
    expect(aNode.tiles.map((t) => t.visible)).toEqual([true, false, false]);
    expect(aNode.tiles.map((t) => t.locked)).toEqual([false, false, true]);
    expect(bNode.tiles.map((t) => t.visible)).toEqual([true, false, false]);
    expect(bNode.tiles.map((t) => t.locked)).toEqual([false, false, true]);

    // At the team's station (`a`): Tier 2 (slot 1) flips visible —
    // claim-unlocked + at-station privilege. Tier 3 (slot 2) stays
    // hidden because its claim timer (3600s) hasn't elapsed.
    const stationTiles = projection.atStation?.tiles ?? [];
    expect(stationTiles.map((t) => t.visible)).toEqual([true, true, false]);
    expect(stationTiles.map((t) => t.locked)).toEqual([false, false, true]);
    expect(stationTiles[1]!.tile).not.toBeNull();
    // The privilege is station-only: `bNode` (not the team's node)
    // still keeps Tier 2 hidden on the map.
    expect(bNode.tiles[1]!.visible).toBe(false);
    expect(bNode.tiles[1]!.tile).toBeNull();
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
