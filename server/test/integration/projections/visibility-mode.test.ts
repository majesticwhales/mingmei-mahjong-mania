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
 * `slotMapUnlockOffsetsSeconds` snapshots passed at game creation; we
 * then build the projection at `t = startedAt` (before slot 1 unlocks)
 * so the on/off behaviour of the slot gate is observable in `atStation`.
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
    it("respects phase fog on the map; atStation mirrors mapNodes[teamNode].tiles[]", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["a", "b"],
        startNodeCodeBySlot: { 1: "a" },
        nodeTilesByCode: { a: 2, b: 2 },
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60 * 60],
        slotMapUnlockOffsetsSeconds: [0, null],
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

      // Phase L §3.13: every slot the node has appears in `tiles[]`.
      // `a` is face-up so slot 0 is visible (mapOffset = 0 elapsed);
      // slot 1's `mapOffset` is null → permanently hidden (and locked,
      // because the claim timer is still pending). `b` is fogged by
      // phase visibility regardless of timer state.
      const aNode = projection.mapNodes.find((n) => n.code === "a")!;
      const bNode = projection.mapNodes.find((n) => n.code === "b")!;
      expect(aNode.tiles).toHaveLength(2);
      expect(aNode.tiles[0]!).toMatchObject({
        slotIndex: 0,
        visible: true,
        locked: false,
      });
      expect(aNode.tiles[0]!.tile).not.toBeNull();
      expect(aNode.tiles[1]!).toEqual({
        slotIndex: 1,
        tile: null,
        visible: false,
        locked: true,
      });
      expect(bNode.tiles).toHaveLength(2);
      expect(bNode.tiles.map((t) => t.visible)).toEqual([false, false]);
      expect(bNode.tiles.map((t) => t.tile)).toEqual([null, null]);

      // The at-station privilege (TDD §3.3) doesn't fire here: slot 1's
      // claim timer hasn't elapsed (locked=true) AND its map timer is
      // null, so `nodeFaceUp && (mapVisible || !locked)` collapses to
      // false either way. atStation matches mapNodes[teamNode] in this
      // window; they diverge only when a slot is claim-unlocked but
      // not yet map-revealed (see the dedicated privilege test).
      expect(projection.atStation?.tiles).toEqual(aNode.tiles);

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
        slotMapUnlockOffsetsSeconds: [0, 60 * 60],
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
      // Phase fog still hides every slot at `b`.
      expect(bNode.tiles).toHaveLength(2);
      expect(bNode.tiles.map((t) => t.visible)).toEqual([false, false]);
      expect(bNode.tiles.map((t) => t.tile)).toEqual([null, null]);
      // Slot off => both slots at `a` are exposed on the map, and the
      // claim-unlock timer is ignored (locked: false everywhere).
      expect(aNode.tiles).toHaveLength(2);
      expect(aNode.tiles.map((t) => t.slotIndex)).toEqual([0, 1]);
      expect(aNode.tiles.map((t) => t.visible)).toEqual([true, true]);
      expect(aNode.tiles.map((t) => t.locked)).toEqual([false, false]);
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
        slotMapUnlockOffsetsSeconds: [0, null],
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
      // `locked` reflects the claim-unlock timer (slot 1's claim offset
      // is 60 min and the test runs at `now`).
      expect(aNode.tiles).toHaveLength(2);
      expect(aNode.tiles.map((t) => t.visible)).toEqual([true, false]);
      expect(aNode.tiles.map((t) => t.locked)).toEqual([false, true]);
      expect(bNode.tiles).toHaveLength(2);
      expect(bNode.tiles.map((t) => t.visible)).toEqual([true, false]);
      expect(bNode.tiles.map((t) => t.locked)).toEqual([false, true]);

      // Checked in at `a`: the at-station privilege (TDD §3.3) doesn't
      // fire because slot 1's claim timer is 60 min away — locked=true
      // and `mapVisible || !locked` resolves to false. atStation
      // matches aNode here; the privilege only flips a slot when its
      // claim timer has elapsed but the map timer hasn't.
      expect(projection.atStation?.tiles).toEqual(aNode.tiles);

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
        slotMapUnlockOffsetsSeconds: [0, null],
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
      // Both layers off: every node face-up, every slot map-visible,
      // every slot unlocked (claim timer ignored).
      expect(aNode.tiles).toHaveLength(2);
      expect(aNode.tiles.map((t) => t.visible)).toEqual([true, true]);
      expect(aNode.tiles.map((t) => t.locked)).toEqual([false, false]);
      expect(bNode.tiles).toHaveLength(2);
      expect(bNode.tiles.map((t) => t.visible)).toEqual([true, true]);
      expect(bNode.tiles.map((t) => t.locked)).toEqual([false, false]);
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
      // Phase off + single slot: every node exposes its lone slot via
      // the exhaustive `tiles[]` (Phase L §3.13 — no more singular `tile`).
      expect(aNode.tiles).toHaveLength(1);
      expect(aNode.tiles[0]!).toMatchObject({
        slotIndex: 0,
        visible: true,
        locked: false,
      });
      expect(aNode.tiles[0]!.tile?.instanceId).toBe(
        fixture.nodeTiles.find((t) => t.nodeCode === "a")!.gameTileId,
      );
      expect(bNode.tiles).toHaveLength(1);
      expect(bNode.tiles[0]!).toMatchObject({
        slotIndex: 0,
        visible: true,
        locked: false,
      });
      expect(bNode.tiles[0]!.tile?.instanceId).toBe(
        fixture.nodeTiles.find((t) => t.nodeCode === "b")!.gameTileId,
      );
    });
  });
});
