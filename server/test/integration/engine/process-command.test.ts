import { beforeEach, describe, expect, it } from "vitest";
import type {
  CommandHandler,
  CommandResult,
} from "../../../src/engine/process-command.ts";
import { processCommand } from "../../../src/engine/process-command.ts";
import type { CommandType } from "../../../src/engine/types.ts";
import { Game } from "../../../src/models/game.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { RecordingBroadcaster } from "../../setup/recording-broadcaster.ts";

function fakeHandler(
  events: CommandResult["events"],
): CommandHandler {
  return {
    handle: async () => ({ events }),
  };
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("processCommand", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  async function setupFixture() {
    return setupLightweightGame();
  }

  it("rejects unknown command types before any DB work", async () => {
    const fixture = await setupFixture();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand(
        {
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          userId: participant.userId,
          commandType: "CHECK_IN",
          payload: {},
        },
        { handlers: new Map() },
      ),
    ).rejects.toMatchObject({ status: 400, code: "unknown_command" });
  });

  it("rejects when the game does not exist", async () => {
    const handlers = new Map<CommandType, CommandHandler>([
      ["CHECK_IN", fakeHandler([{ eventType: "CHECK_IN" }])],
    ]);

    await expect(
      processCommand(
        {
          gameId: NIL_UUID,
          gameTeamId: NIL_UUID,
          userId: NIL_UUID,
          commandType: "CHECK_IN",
          payload: {},
        },
        { handlers },
      ),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects commands against a non-active game", async () => {
    const fixture = await setupFixture();
    await Game.update(
      { status: "ended" },
      { where: { id: fixture.gameId } },
    );
    const participant = fixture.participants[0]!;
    const handlers = new Map<CommandType, CommandHandler>([
      ["CHECK_IN", fakeHandler([{ eventType: "CHECK_IN" }])],
    ]);

    await expect(
      processCommand(
        {
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          userId: participant.userId,
          commandType: "CHECK_IN",
          payload: {},
        },
        { handlers },
      ),
    ).rejects.toMatchObject({ status: 409, code: "game_not_active" });
  });

  it("rejects when the user is not a participant of the named team", async () => {
    const fixture = await setupFixture();
    const onTeamOne = fixture.participants[0]!;
    const onTeamTwo = fixture.participants.find(
      (p) => p.gameTeamId !== onTeamOne.gameTeamId,
    )!;
    const handlers = new Map<CommandType, CommandHandler>([
      ["CHECK_IN", fakeHandler([{ eventType: "CHECK_IN" }])],
    ]);

    await expect(
      processCommand(
        {
          gameId: fixture.gameId,
          gameTeamId: onTeamOne.gameTeamId,
          userId: onTeamTwo.userId,
          commandType: "CHECK_IN",
          payload: {},
        },
        { handlers },
      ),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("dispatches to the handler, stamps actor metadata on events, and broadcasts post-commit", async () => {
    const fixture = await setupFixture();
    const participant = fixture.participants[0]!;
    const broadcaster = new RecordingBroadcaster();
    const handlers = new Map<CommandType, CommandHandler>([
      [
        "CHECK_IN",
        fakeHandler([
          { eventType: "CHECK_OUT", payload: { reason: "implicit" } },
          { eventType: "CHECK_IN", payload: { nodeCode: "bay" } },
        ]),
      ],
    ]);

    const result = await processCommand(
      {
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeCode: "bay" },
      },
      { handlers, broadcaster },
    );

    expect(result.events).toHaveLength(2);
    expect(result.events.map((e) => e.eventType)).toEqual([
      "CHECK_OUT",
      "CHECK_IN",
    ]);
    expect(result.events.map((e) => e.sequence)).toEqual(["1", "2"]);
    expect(
      result.events.every(
        (e) =>
          e.actorUserId === participant.userId &&
          e.actorGameTeamId === participant.gameTeamId,
      ),
    ).toBe(true);
    expect(result.events[0]!.payload).toEqual({ reason: "implicit" });

    expect(broadcaster.events.map((r) => r.event.eventType)).toEqual([
      "CHECK_OUT",
      "CHECK_IN",
    ]);
    expect(broadcaster.events.every((r) => r.gameId === fixture.gameId)).toBe(
      true,
    );
    expect(broadcaster.stateBroadcasts).toEqual([fixture.gameId]);
    expect(broadcaster.notifications).toEqual([]);
  });

  it("rolls back the event log when the handler throws", async () => {
    const fixture = await setupFixture();
    const participant = fixture.participants[0]!;
    const broadcaster = new RecordingBroadcaster();
    const boom = new Error("handler failed");
    const handlers = new Map<CommandType, CommandHandler>([
      [
        "CHECK_IN",
        {
          handle: async () => {
            throw boom;
          },
        },
      ],
    ]);

    await expect(
      processCommand(
        {
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          userId: participant.userId,
          commandType: "CHECK_IN",
          payload: {},
        },
        { handlers, broadcaster },
      ),
    ).rejects.toBe(boom);

    const eventCount = await GameEvent.count({
      where: { gameId: fixture.gameId },
    });
    expect(eventCount).toBe(0);

    expect(broadcaster.events).toEqual([]);
    expect(broadcaster.stateBroadcasts).toEqual([]);
  });
});
