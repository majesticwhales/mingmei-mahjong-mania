import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameNode } from "../../../../src/models/game-node.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

async function findNodeIdByCode(
  gameId: string,
  code: string,
): Promise<string> {
  const node = await GameNode.findOne({ where: { gameId, code } });
  if (!node) {
    throw new Error(`Expected node ${code} on game ${gameId}`);
  }
  return node.id;
}

describe("CHECK_IN handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("checks an unchecked team in and emits a single CHECK_IN event", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: bayId },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHECK_IN");
    expect(event!.payload).toEqual({ nodeId: bayId, nodeCode: "bay" });
    expect(event!.actorGameTeamId).toBe(participant.gameTeamId);
    expect(event!.actorUserId).toBe(participant.userId);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(bayId);
    expect(position?.checkedInAt).toBeInstanceOf(Date);
  });

  it("performs an implicit check-out when checking in elsewhere", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    const targetNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bloor-yonge" },
    });
    if (!targetNode) {
      throw new Error("Expected bloor-yonge in TTC 2026 template");
    }

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: targetNode.id },
    });

    expect(result.events.map((e) => e.eventType)).toEqual([
      "CHECK_OUT",
      "CHECK_IN",
    ]);
    expect(result.events.map((e) => e.sequence)).toEqual(["1", "2"]);

    const [checkOutEvent, checkInEvent] = result.events;
    expect(checkOutEvent!.payload).toMatchObject({
      nodeCode: "bay",
      implicit: true,
    });
    expect(checkInEvent!.payload).toEqual({
      nodeId: targetNode.id,
      nodeCode: "bloor-yonge",
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(targetNode.id);
  });

  it("rejects with already_at_node when the team is already at the target station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "already_at_node" });
  });

  it("rejects with node_not_in_game when the nodeId does not belong to the game", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 404, code: "node_not_in_game" });
  });

  it("rejects with invalid_payload when nodeId is missing", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });
});
