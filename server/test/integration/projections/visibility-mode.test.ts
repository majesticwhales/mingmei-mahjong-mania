import { beforeEach, describe, expect, it } from "vitest";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { GameLocationTeamVisibility } from "../../../src/models/game-location-team-visibility.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Projection branching per `games.visibility_mode` (chunk 4). Each test
 * exercises one of the four modes against the same fixture shape so the
 * per-mode shape of `mapNodes` / `atStation` / `nextVisibilityChangeAt`
 * is obvious from the diff.
 *
 * `setupLightweightGame` skips the engine bootstrap entirely, so for
 * each test we seed only the rows the projection actually consults:
 *
 *   - `game_location_team_visibility` (phase face-up) for `mode='both'`
 *     and `mode='phase'`, so the phase layer has something to gate
 *     against. The other modes deliberately leave it empty, mirroring
 *     `game-start-service` skipping `bootstrapGameVisibilityGroups`.
 *   - `game_scheduled_jobs` `VISIBILITY_PHASE_ADVANCE` to verify
 *     `nextVisibilityChangeAt` is forwarded when phase is on and
 *     short-circuited to `null` when phase is off.
 *
 * The slot layer is exercised via `slotUnlockOffsetsSeconds` /
 * `slotMapVisible` snapshots passed at game creation; we then build
 * the projection at `t = startedAt` (before slot 1 unlocks) so the
 * on/off behaviour of the slot gate is observable in `atStation`.
 */

async function seedFaceUp(
  gameTeamId: string,
  gameNodeIds: string[],
): Promise<void> {
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

async function seedPendingPhaseAdvance(
  gameId: string,
  runAt: Date,
): Promise<void> {
  await GameScheduledJob.create({
    gameId,
    jobType: "VISIBILITY_PHASE_ADVANCE",
    runAt,
    status: "pending",
    payload: { targetPhase: 1 },
  });
}

describe("buildGameStateProjection (visibility mode)", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  describe("mode = 'both' (baseline)", () => {
    it("respects phase fog on the map and locks slot 1 at atStation", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        startNodeCodeBySlot: { 1: "a" },
        nodeTilesByCode: { a: 2, b: 2 },
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60 * 60],
        slotMapVisible: [true, false],
        visibilityMode: "both",
      });
      const participant = fixture.participants[0]!;
      const aId = fixture.nodeIdByCode.get("a")!;
      await seedFaceUp(participant.gameTeamId, [aId]);
      await seedPendingPhaseAdvance(
        fixture.gameId,
        new Date(Date.now() + 30 * 60 * 1000),
      );

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
        { now: new Date() },
      );

      // Phase fog: only `a` (face-up) shows a tile entry, `b` is hidden.
      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      expect(aNode.tiles).toHaveLength(1);
      expect(aNode.tiles![0]!.slotIndex).toBe(0);
      expect(bNode.tiles).toBeUndefined();

      // Slot fog at the station: only the unlocked slot 0 is exposed.
      expect(projection.atStation?.tiles).toHaveLength(1);
      expect(projection.atStation?.tiles![0]!.slotIndex).toBe(0);

      expect(projection.nextVisibilityChangeAt).not.toBeNull();
    });
  });

  describe("mode = 'phase' (slot off)", () => {
    it("keeps phase fog on the map but exposes every slot at atStation", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        startNodeCodeBySlot: { 1: "a" },
        nodeTilesByCode: { a: 2, b: 2 },
        slotsPerNode: 2,
        // Slot 1 has a non-zero unlock offset, but since slot layer is
        // off the projection ignores it. Realistic games in this mode
        // wouldn't have non-zero offsets (chunk-2 lock + transition
        // reset both prevent it), but we test against a contrived
        // stale value to pin the projection's behaviour.
        slotUnlockOffsetsSeconds: [0, 60 * 60],
        slotMapVisible: [true, true],
        visibilityMode: "phase",
      });
      const participant = fixture.participants[0]!;
      const aId = fixture.nodeIdByCode.get("a")!;
      await seedFaceUp(participant.gameTeamId, [aId]);
      await seedPendingPhaseAdvance(
        fixture.gameId,
        new Date(Date.now() + 10 * 60 * 1000),
      );

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
        { now: new Date() },
      );

      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      // Phase fog still hides `b`.
      expect(bNode.tiles).toBeUndefined();
      // Slot off => both slots at `a` are exposed on the map.
      expect(aNode.tiles?.map((t) => t.slotIndex)).toEqual([0, 1]);
      // Slot off => both slots at the station regardless of unlock offset.
      expect(projection.atStation?.tiles?.map((t) => t.slotIndex)).toEqual([
        0,
        1,
      ]);

      expect(projection.nextVisibilityChangeAt).not.toBeNull();
    });
  });

  describe("mode = 'slot' (phase off)", () => {
    it("treats every node as face-up and reports nextVisibilityChangeAt=null", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        startNodeCodeBySlot: { 1: "a" },
        nodeTilesByCode: { a: 2, b: 2 },
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60 * 60],
        slotMapVisible: [true, false],
        visibilityMode: "slot",
      });
      const participant = fixture.participants[0]!;
      // Deliberately don't seed `game_location_team_visibility` — the
      // phase-off branch should ignore the empty set and treat every
      // node as face-up. A pending phase-advance job is also seeded
      // (stale config); the projection short-circuits it to `null`.
      await seedPendingPhaseAdvance(
        fixture.gameId,
        new Date(Date.now() + 60 * 1000),
      );

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
        { now: new Date() },
      );

      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      // Slot rules still apply: slot 1 is map-hidden, slot 0 is exposed.
      expect(aNode.tiles?.map((t) => t.slotIndex)).toEqual([0]);
      expect(bNode.tiles?.map((t) => t.slotIndex)).toEqual([0]);

      // Slot at atStation: slot 1 still locked (offset 60min > now).
      expect(projection.atStation?.tiles?.map((t) => t.slotIndex)).toEqual([
        0,
      ]);

      expect(projection.nextVisibilityChangeAt).toBeNull();
    });
  });

  describe("mode = 'none' (both layers off)", () => {
    it("exposes every node + every slot and zeroes nextVisibilityChangeAt", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        startNodeCodeBySlot: { 1: "a" },
        nodeTilesByCode: { a: 2, b: 2 },
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60 * 60],
        slotMapVisible: [true, false],
        visibilityMode: "none",
      });
      const participant = fixture.participants[0]!;
      await seedPendingPhaseAdvance(
        fixture.gameId,
        new Date(Date.now() + 60 * 1000),
      );

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
        { now: new Date() },
      );

      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      // Both layers off: every node face-up, every slot map-visible.
      expect(aNode.tiles?.map((t) => t.slotIndex)).toEqual([0, 1]);
      expect(bNode.tiles?.map((t) => t.slotIndex)).toEqual([0, 1]);
      // Slot off: both station slots exposed, ignoring the unlock offset.
      expect(projection.atStation?.tiles?.map((t) => t.slotIndex)).toEqual([
        0,
        1,
      ]);

      expect(projection.nextVisibilityChangeAt).toBeNull();
    });
  });

  describe("single-slot games", () => {
    it("mode='slot' single-slot still surfaces every node face-up on the map", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        nodeTilesByCode: { a: 1, b: 1 },
        visibilityMode: "slot",
      });
      const participant = fixture.participants[0]!;
      // No seedFaceUp here.

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      // Phase off + single slot: both nodes expose their tile via `tile`
      // (single-slot convention; not `tiles[]`).
      expect(aNode.tile?.instanceId).toBe(
        fixture.nodeTiles.find((t) => t.nodeCode === "a")!.gameTileId,
      );
      expect(bNode.tile?.instanceId).toBe(
        fixture.nodeTiles.find((t) => t.nodeCode === "b")!.gameTileId,
      );
    });
  });
});
