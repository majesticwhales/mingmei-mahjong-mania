import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameTilePlacement } from "../../../../src/models/game-tile-placement.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("SWAP_TILE handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
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
});
