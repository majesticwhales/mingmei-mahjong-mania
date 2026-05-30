import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameNode } from "../../../../src/models/game-node.ts";
import { GameTilePlacement } from "../../../../src/models/game-tile-placement.ts";
import { setupStartedGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("SWAP_TILE handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("swaps the requested hand and station tiles and emits a SWAP_TILE event", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const bay = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    const stationPlacement = await GameTilePlacement.findOne({
      where: { gameNodeId: bay!.id },
    });
    const handTileId = handPlacement!.gameTileId;
    const stationTileId = stationPlacement!.gameTileId;

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
      nodeId: bay!.id,
      nodeCode: "bay",
      handTileId,
      stationTileId,
    });

    const [refreshedHand, refreshedStation] = await Promise.all([
      GameTilePlacement.findOne({ where: { gameTileId: handTileId } }),
      GameTilePlacement.findOne({ where: { gameTileId: stationTileId } }),
    ]);
    expect(refreshedHand?.gameTeamId).toBeNull();
    expect(refreshedHand?.gameNodeId).toBe(bay!.id);
    expect(refreshedStation?.gameTeamId).toBe(participant.gameTeamId);
    expect(refreshedStation?.gameNodeId).toBeNull();
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const participant = fixture.participants[0]!;
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    const someStationTile = await GameTilePlacement.findOne({
      where: { gameTeamId: null },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: handPlacement!.gameTileId,
          stationTileId: someStationTile!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("rejects with tile_not_in_hand when handTileId belongs to another team", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const onTeamOne = fixture.participants[0]!;
    const otherTeamId = fixture.participants.find(
      (p) => p.gameTeamId !== onTeamOne.gameTeamId,
    )!.gameTeamId;
    const otherHandTile = await GameTilePlacement.findOne({
      where: { gameTeamId: otherTeamId },
    });
    const bay = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });
    const stationPlacement = await GameTilePlacement.findOne({
      where: { gameNodeId: bay!.id },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: onTeamOne.gameTeamId,
        userId: onTeamOne.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: otherHandTile!.gameTileId,
          stationTileId: stationPlacement!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_in_hand" });
  });

  it("rejects with tile_not_in_hand when handTileId is unknown", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const bay = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });
    const stationPlacement = await GameTilePlacement.findOne({
      where: { gameNodeId: bay!.id },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: randomUUID(),
          stationTileId: stationPlacement!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_in_hand" });
  });

  it("rejects with tile_not_at_station when stationTileId is at a different node", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    const elsewhere = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bloor-yonge" },
    });
    const otherStationTile = await GameTilePlacement.findOne({
      where: { gameNodeId: elsewhere!.id },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: handPlacement!.gameTileId,
          stationTileId: otherStationTile!.gameTileId,
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_at_station" });
  });

  it("rejects with tile_not_at_station when stationTileId is unknown", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: {
          handTileId: handPlacement!.gameTileId,
          stationTileId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "tile_not_at_station" });
  });

  it("rejects with invalid_payload when handTileId is missing", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
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
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_TILE",
        payload: { handTileId: handPlacement!.gameTileId },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  it("rejects with invalid_payload when handTileId === stationTileId", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: "bay" });
    const participant = fixture.participants[0]!;
    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    const same = handPlacement!.gameTileId;

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
