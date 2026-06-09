import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("SWAP_LOCATION_TILES handler (stub)", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 501 not_implemented until the challenge phase wires it up", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_LOCATION_TILES",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 501, code: "not_implemented" });
  });

  it("rejects with hand_completed when the team's hand is already locked (Phase J)", async () => {
    // Hand-completed lock runs before the not_implemented stub, so a
    // sealed team sees the more specific rejection code.
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "SWAP_LOCATION_TILES",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });
});
