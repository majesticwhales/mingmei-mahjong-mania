import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNodeView } from "../../../src/services/node-view.ts";
import { HttpError } from "../../../src/lib/http-error.ts";
import { Game } from "../../../src/models/game.ts";
import { GameTilePlacement } from "../../../src/models/game-tile-placement.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Phase L Chunk 4 (B-1): focused coverage on the new `buildNodeView`
 * helper. Per-slot `tiles[]` parity with `MapNodeDto.tiles[]` is covered
 * by the broader projection tests + Chunk 4 B-3's HTTP integration
 * tests; these scenarios pin the action-reason matrix + 404/409
 * preconditions so a refactor that breaks either fails loudly here.
 */

describe("buildNodeView", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns tiles and an enabled CHECK_OUT/SWAP_TILE pair for a team checked in at the node", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    expect(view.nodeId).toBe(bayId);
    expect(view.code).toBe("bay");
    expect(view.tiles).toHaveLength(1);
    expect(view.tiles[0]).toMatchObject({
      slotIndex: 0,
      visible: true,
      locked: false,
    });
    expect(view.tiles[0]!.tile).not.toBeNull();

    const actionMap = new Map(
      view.availableActions.map((a) => [a.action, a]),
    );
    expect(actionMap.get("check_out")).toEqual({
      action: "check_out",
      enabled: true,
    });
    expect(actionMap.get("swap_tile")).toEqual({
      action: "swap_tile",
      enabled: true,
    });
    // CHECK_IN is omitted from the action list when the team is
    // already at this station.
    expect(actionMap.has("check_in")).toBe(false);
  });

  it("disables CHECK_OUT with wrong_node when the team is at a different station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "north"],
      startNodeCodeBySlot: { 1: "north" },
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    const actionMap = new Map(
      view.availableActions.map((a) => [a.action, a]),
    );
    expect(actionMap.get("check_in")).toEqual({
      action: "check_in",
      enabled: true,
    });
    expect(actionMap.get("check_out")).toEqual({
      action: "check_out",
      enabled: false,
      reason: "wrong_node",
    });
    expect(actionMap.get("swap_tile")).toEqual({
      action: "swap_tile",
      enabled: false,
      reason: "wrong_node",
    });
  });

  it("disables CHECK_OUT with not_checked_in when the team has no current node", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    const actionMap = new Map(
      view.availableActions.map((a) => [a.action, a]),
    );
    expect(actionMap.get("check_in")).toEqual({
      action: "check_in",
      enabled: true,
    });
    expect(actionMap.get("check_out")).toEqual({
      action: "check_out",
      enabled: false,
      reason: "not_checked_in",
    });
    expect(actionMap.get("swap_tile")).toEqual({
      action: "swap_tile",
      enabled: false,
      reason: "not_checked_in",
    });
  });

  it("flips SWAP_TILE to slot_locked when every unlocked slot is empty", async () => {
    // Slot 0 is unlocked (offset 0) but has no tile placed. Slot 1 is
    // claim-locked (offset 600s in the future). Result: no
    // unlocked-with-tile pairing exists, so SWAP_TILE collapses to
    // `slot_locked` rather than `not_checked_in` / `wrong_node`.
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 600],
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    // The fixture places a single tile at slot 0 by default; move it
    // into slot 1 (the locked one) so slot 0 — the only unlocked slot
    // — is empty.
    const tilePlacement = fixture.nodeTiles[0]!;
    expect(tilePlacement.slotIndex).toBe(0);
    await GameTilePlacement.update(
      { slotIndex: 1 },
      { where: { gameTileId: tilePlacement.gameTileId } },
    );

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    expect(view.tiles).toHaveLength(2);
    expect(view.tiles[0]!.tile).toBeNull();
    expect(view.tiles[1]!.locked).toBe(true);

    const actionMap = new Map(
      view.availableActions.map((a) => [a.action, a]),
    );
    expect(actionMap.get("swap_tile")).toEqual({
      action: "swap_tile",
      enabled: false,
      reason: "slot_locked",
    });
  });

  it("disables mutating actions with hand_completed but leaves check_out alive", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      visibilityMode: "slot",
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    const actionMap = new Map(
      view.availableActions.map((a) => [a.action, a]),
    );
    // §3.10 exempts check_in / check_out from the hand-completed lock —
    // a completed team can still navigate.
    expect(actionMap.get("check_out")).toEqual({
      action: "check_out",
      enabled: true,
    });
    expect(actionMap.get("swap_tile")).toEqual({
      action: "swap_tile",
      enabled: false,
      reason: "hand_completed",
    });
    expect(actionMap.get("claim_win")).toEqual({
      action: "claim_win",
      enabled: false,
      reason: "hand_completed",
    });
    expect(actionMap.get("start_challenge")).toEqual({
      action: "start_challenge",
      enabled: false,
      reason: "hand_completed",
    });
  });

  it("flips every action to game_ended when the game is in the ending drain window", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await Game.update(
      { status: "ending" },
      { where: { id: fixture.gameId } },
    );

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    for (const action of view.availableActions) {
      expect(action.enabled).toBe(false);
      expect(action.reason).toBe("game_ended");
    }
  });

  it("applies the at-station privilege when the team is at this node (claim-unlocked + map-hidden → visible)", async () => {
    // Tier 2 spec (TDD §3.3): slot 1 is claimable from t=0 but map-
    // hidden until t=3600. When the team is at the node, the at-
    // station privilege flips slot 1 to `visible: true` even though
    // the strict map view says hidden.
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      nodeTilesByCode: { bay: 2 },
      slotsPerNode: 2,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 0],
      slotMapUnlockOffsetsSeconds: [0, 3600],
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    expect(view.tiles.map((t) => t.visible)).toEqual([true, true]);
    expect(view.tiles.map((t) => t.locked)).toEqual([false, false]);
    expect(view.tiles[1]!.tile).not.toBeNull();
  });

  it("withholds the at-station privilege from other nodes — browsing elsewhere keeps the map view", async () => {
    // Same offsets as the privilege test, but the team is at `north`
    // and views `bay`. Slot 1's claim timer has fired but the team
    // isn't at this station, so the strict map rule applies and slot
    // 1 stays hidden.
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "north"],
      startNodeCodeBySlot: { 1: "north" },
      nodeTilesByCode: { bay: 2, north: 2 },
      slotsPerNode: 2,
      visibilityMode: "slot",
      slotUnlockOffsetsSeconds: [0, 0],
      slotMapUnlockOffsetsSeconds: [0, 3600],
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    const view = await buildNodeView({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      nodeId: bayId,
    });

    expect(view.tiles.map((t) => t.visible)).toEqual([true, false]);
    expect(view.tiles.map((t) => t.locked)).toEqual([false, false]);
    expect(view.tiles[1]!.tile).toBeNull();
  });

  it("throws 409 game_ended once the game row flips to ended", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await Game.update(
      { status: "ended" },
      { where: { id: fixture.gameId } },
    );

    await expect(
      buildNodeView({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        nodeId: bayId,
      }),
    ).rejects.toMatchObject({ status: 409, code: "game_ended" });
  });

  it("throws 404 game_not_found for an unknown game id", async () => {
    await expect(
      buildNodeView({
        gameId: randomUUID(),
        gameTeamId: randomUUID(),
        nodeId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404, code: "game_not_found" });
  });

  it("throws 404 node_not_found for a node id not on this game's map", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      visibilityMode: "slot",
    });
    const participant = fixture.participants[0]!;

    await expect(
      buildNodeView({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        nodeId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404, code: "node_not_found" });
  });

  it("throws 404 node_not_found when the node belongs to a different game", async () => {
    const [gameA, gameB] = await Promise.all([
      setupLightweightGame({ nodeCodes: ["bay"], visibilityMode: "slot" }),
      setupLightweightGame({ nodeCodes: ["north"], visibilityMode: "slot" }),
    ]);
    const participant = gameA.participants[0]!;
    const otherNodeId = gameB.nodeIdByCode.get("north")!;

    await expect(
      buildNodeView({
        gameId: gameA.gameId,
        gameTeamId: participant.gameTeamId,
        nodeId: otherNodeId,
      }),
    ).rejects.toMatchObject({ status: 404, code: "node_not_found" });
  });

  it("throws 404 team_not_in_game when the team belongs to another game", async () => {
    const [gameA, gameB] = await Promise.all([
      setupLightweightGame({ nodeCodes: ["bay"], visibilityMode: "slot" }),
      setupLightweightGame({ nodeCodes: ["north"], visibilityMode: "slot" }),
    ]);
    const nodeId = gameA.nodeIdByCode.get("bay")!;
    const otherTeamId = gameB.participants[0]!.gameTeamId;

    await expect(
      buildNodeView({
        gameId: gameA.gameId,
        gameTeamId: otherTeamId,
        nodeId,
      }),
    ).rejects.toMatchObject({ status: 404, code: "team_not_in_game" });
  });

  it("surfaces a HttpError instance (not a plain Error)", async () => {
    await expect(
      buildNodeView({
        gameId: randomUUID(),
        gameTeamId: randomUUID(),
        nodeId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
