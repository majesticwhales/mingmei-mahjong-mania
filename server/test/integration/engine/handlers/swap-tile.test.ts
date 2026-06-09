import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import { GameTilePlacement } from "../../../../src/models/game-tile-placement.ts";
import {
  attachChallengeToGameNode,
  clearTestChallenges,
} from "../../../setup/challenges.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("SWAP_TILE handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("swaps the requested hand and station tiles and emits a SWAP_TILE event", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const handTileId = fixture.handTiles[0]!.gameTileId;
    const stationTileId = fixture.nodeTiles[0]!.gameTileId;

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "SWAP_TILE",
      payload: { handTileId, stationTileId },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("SWAP_TILE");
    expect(event!.payload).toEqual({
      nodeId: bayId,
      nodeCode: "bay",
      handTileId,
      stationTileId,
    });

    const [refreshedHand, refreshedStation] = await Promise.all([
      GameTilePlacement.findOne({ where: { gameTileId: handTileId } }),
      GameTilePlacement.findOne({ where: { gameTileId: stationTileId } }),
    ]);
    expect(refreshedHand?.gameTeamId).toBeNull();
    expect(refreshedHand?.gameNodeId).toBe(bayId);
    expect(refreshedHand?.slotIndex).toBe(fixture.nodeTiles[0]!.slotIndex);
    expect(refreshedStation?.gameTeamId).toBe(participant.gameTeamId);
    expect(refreshedStation?.gameNodeId).toBeNull();
    expect(refreshedStation?.slotIndex).toBeNull();
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: fixture.nodeTiles[0]!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("rejects with tile_not_in_hand when handTileId belongs to another team", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1, 2: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const onTeamOne = fixture.participants[0]!;
    const otherTeamTile = fixture.handTiles.find(
      (t) => t.teamSlot === 2,
    )!.gameTileId;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: onTeamOne.gameTeamId,
        userId: onTeamOne.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: otherTeamTile,
          stationTileId: fixture.nodeTiles[0]!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_in_hand" });
  });

  it("rejects with tile_not_in_hand when handTileId is unknown", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: randomUUID(),
          stationTileId: fixture.nodeTiles[0]!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_in_hand" });
  });

  it("rejects with tile_not_at_station when stationTileId is at a different node", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { "bloor-yonge": 1 },
    });
    const participant = fixture.participants[0]!;
    const elsewhereTile = fixture.nodeTiles.find(
      (t) => t.nodeCode === "bloor-yonge",
    )!.gameTileId;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: elsewhereTile,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_at_station" });
  });

  it("rejects with tile_not_at_station when stationTileId is unknown", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_at_station" });
  });

  it("rejects with invalid_payload when handTileId is missing", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: { stationTileId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  it("rejects with invalid_payload when stationTileId is missing", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: { handTileId: fixture.handTiles[0]!.gameTileId },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  it("rejects with slot_locked when the targeted slot's unlock offset is in the future", async () => {
    // 2-slot station; slot 1 unlocks at +1 hour from "now". The hand tile
    // tries to take slot 1 before that — must be rejected with 409
    // slot_locked. (Slot 0 has offset 0 and stays swap-eligible.)
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 2 },
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 60 * 60],
    });
    const participant = fixture.participants[0]!;
    const slotOneTile = fixture.nodeTiles.find((t) => t.slotIndex === 1)!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: slotOneTile.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "slot_locked" });
  });

  it("permits swap against slot 0 even when later slots are still locked", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 2 },
      slotsPerNode: 2,
      slotUnlockOffsetsSeconds: [0, 60 * 60],
    });
    const participant = fixture.participants[0]!;
    const slotZeroTile = fixture.nodeTiles.find((t) => t.slotIndex === 0)!;

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "SWAP_TILE",
      payload: {
        handTileId: fixture.handTiles[0]!.gameTileId,
        stationTileId: slotZeroTile.gameTileId,
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("SWAP_TILE");
  });

  it("rejects with invalid_payload when handTileId === stationTileId", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
    });
    const participant = fixture.participants[0]!;
    const same = fixture.handTiles[0]!.gameTileId;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: { handTileId: same, stationTileId: same },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  // -------------------------------------------------------------------------
  // Phase H: challenge gate. Stations carrying any `game_node_challenges`
  // row require `pending_swap_credit === true` (set by
  // CHALLENGE_COMPLETED) before a SWAP_TILE will succeed. Stations with
  // no challenges configured stay free-swap for back-compat.
  // -------------------------------------------------------------------------

  it("rejects with swap_credit_required when the station has a challenge but the team lacks a credit", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: fixture.nodeTiles[0]!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "swap_credit_required" });
  });

  it("consumes pending_swap_credit on a successful swap but keeps credit_earned_in_session sticky", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameTeamPosition.update(
      { pendingSwapCredit: true, creditEarnedInSession: true },
      { where: { gameTeamId: participant.gameTeamId } },
    );

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "SWAP_TILE",
      payload: {
        handTileId: fixture.handTiles[0]!.gameTileId,
        stationTileId: fixture.nodeTiles[0]!.gameTileId,
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("SWAP_TILE");

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(false);
    expect(position?.creditEarnedInSession).toBe(true);
  });

  it("rejects with hand_completed when the team has already claimed a winning tile (Phase J lock)", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: fixture.handTiles[0]!.gameTileId,
          stationTileId: fixture.nodeTiles[0]!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });

  it("permits a swap without a credit when the station has no challenges configured (back-compat)", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "SWAP_TILE",
      payload: {
        handTileId: fixture.handTiles[0]!.gameTileId,
        stationTileId: fixture.nodeTiles[0]!.gameTileId,
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("SWAP_TILE");

    // Credit flags should remain untouched on a back-compat swap.
    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(false);
    expect(position?.creditEarnedInSession).toBe(false);
  });
});
