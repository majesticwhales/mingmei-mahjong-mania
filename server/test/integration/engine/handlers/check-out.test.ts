import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameNode } from "../../../../src/models/game-node.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("CHECK_OUT handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("clears the team's position and emits a CHECK_OUT event", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: {},
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHECK_OUT");
    expect(event!.payload).toEqual({
      nodeId: bayNode!.id,
      nodeCode: "bay",
      implicit: false,
    });
    expect(event!.actorGameTeamId).toBe(participant.gameTeamId);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBeNull();
    expect(position?.checkedInAt).toBeNull();
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_OUT",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });
});
