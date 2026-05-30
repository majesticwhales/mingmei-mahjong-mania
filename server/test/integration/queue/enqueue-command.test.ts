import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Game } from "../../../src/models/game.ts";
import { GameCommandQueueItem } from "../../../src/models/game-command-queue-item.ts";
import { enqueueCommand } from "../../../src/queue/enqueue-command.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";

describe("enqueueCommand", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("inserts a pending row and returns status='fresh'", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;
    const clientCommandId = randomUUID();

    const result = await enqueueCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeCode: "bay" },
      clientCommandId,
    });

    expect(result.status).toBe("fresh");
    expect(result.item.status).toBe("pending");
    expect(result.item.gameId).toBe(fixture.gameId);
    expect(result.item.gameTeamId).toBe(participant.gameTeamId);
    expect(result.item.userId).toBe(participant.userId);
    expect(result.item.commandType).toBe("CHECK_IN");
    expect(result.item.payload).toEqual({ nodeCode: "bay" });
    expect(result.item.clientCommandId).toBe(clientCommandId);

    const persisted = await GameCommandQueueItem.findByPk(result.item.id);
    expect(persisted?.status).toBe("pending");
  });

  it("returns status='duplicate' (no new row) on retry with the same clientCommandId and payload", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;
    const clientCommandId = randomUUID();
    const input = {
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN" as const,
      payload: { nodeCode: "bay" },
      clientCommandId,
    };

    const first = await enqueueCommand(input);
    const second = await enqueueCommand(input);

    expect(first.status).toBe("fresh");
    expect(second.status).toBe("duplicate");
    expect(second.item.id).toBe(first.item.id);

    const count = await GameCommandQueueItem.count({
      where: { gameId: fixture.gameId, clientCommandId },
    });
    expect(count).toBe(1);
  });

  it("rejects with client_command_id_conflict when the clientCommandId is reused with a different payload", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;
    const clientCommandId = randomUUID();

    await enqueueCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeCode: "bay" },
      clientCommandId,
    });

    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bloor-yonge" },
        clientCommandId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "client_command_id_conflict",
    });
  });

  it("rejects with 404 when the game does not exist", async () => {
    await expect(
      enqueueCommand({
        gameId: randomUUID(),
        gameTeamId: randomUUID(),
        userId: randomUUID(),
        commandType: "CHECK_IN",
        payload: {},
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects with game_not_active when the game is no longer active", async () => {
    const fixture = await setupLightweightGame();
    await Game.update(
      { status: "ended" },
      { where: { id: fixture.gameId } },
    );
    const participant = fixture.participants[0]!;

    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bay" },
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409, code: "game_not_active" });
  });

  it("rejects with forbidden when the user is not a participant of the team", async () => {
    const fixture = await setupLightweightGame();
    const onTeamOne = fixture.participants[0]!;
    const otherTeam = fixture.participants.find(
      (p) => p.gameTeamId !== onTeamOne.gameTeamId,
    )!;

    // Real user, but addressed to the wrong team.
    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: otherTeam.gameTeamId,
        userId: onTeamOne.userId,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bay" },
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });

    // Outsider not in the game at all.
    const outsider = await registerUser();
    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: onTeamOne.gameTeamId,
        userId: outsider.user.id,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bay" },
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rejects with unknown_command for an unrecognized commandType", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "DOES_NOT_EXIST",
        payload: {},
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400, code: "unknown_command" });
  });

  it("rejects with validation_error when clientCommandId is not a UUID", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bay" },
        clientCommandId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
  });

  it("rejects with validation_error when payload is not an object", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      enqueueCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: [1, 2, 3] as unknown as Record<string, unknown>,
        clientCommandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
  });
});
