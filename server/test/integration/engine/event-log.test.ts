import { beforeEach, describe, expect, it } from "vitest";
import { appendEvent } from "../../../src/engine/event-log.ts";
import { GameEvent } from "../../../src/models/game-event.ts";
import { createGameShell, withGameShell } from "../../setup/game.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("appendEvent", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("assigns sequence 1 to the first event in a game and persists the payload", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const event = await appendEvent(transaction, {
        gameId: shell.gameId,
        eventType: "TEST_EVENT",
        payload: { hello: "world" },
      });

      expect(event.sequence).toBe("1");
      expect(event.eventType).toBe("TEST_EVENT");
      expect(event.payload).toEqual({ hello: "world" });
      expect(event.actorUserId).toBeNull();
      expect(event.actorGameTeamId).toBeNull();
    });
  });

  it("increments sequence strictly within the same transaction", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const first = await appendEvent(transaction, {
        gameId: shell.gameId,
        eventType: "E1",
      });
      const second = await appendEvent(transaction, {
        gameId: shell.gameId,
        eventType: "E2",
      });
      const third = await appendEvent(transaction, {
        gameId: shell.gameId,
        eventType: "E3",
      });

      expect([first.sequence, second.sequence, third.sequence]).toEqual([
        "1",
        "2",
        "3",
      ]);
    });
  });

  it("continues sequence across separate committed transactions", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
    const sequelize = await getSequelize();

    const gameId = await sequelize.transaction(async (tx) => {
      const shell = await createGameShell(lobbyId, tx);
      return shell.gameId;
    });

    await sequelize.transaction((tx) =>
      appendEvent(tx, { gameId, eventType: "E1" }),
    );
    await sequelize.transaction((tx) =>
      appendEvent(tx, { gameId, eventType: "E2" }),
    );

    const events = await GameEvent.findAll({
      where: { gameId },
      order: [["sequence", "ASC"]],
    });
    expect(events.map((e) => e.sequence)).toEqual(["1", "2"]);
    expect(events.map((e) => e.eventType)).toEqual(["E1", "E2"]);
  });

  it("uses independent sequence counters per game", async () => {
    const { lobbyId: lobbyA } = await createLobbyWithFourPlayers({
      assignTeams: false,
    });
    const { lobbyId: lobbyB } = await createLobbyWithFourPlayers({
      assignTeams: false,
    });
    const sequelize = await getSequelize();

    await sequelize.transaction(async (tx) => {
      const shellA = await createGameShell(lobbyA, tx);
      const shellB = await createGameShell(lobbyB, tx);

      const eventA = await appendEvent(tx, {
        gameId: shellA.gameId,
        eventType: "X",
      });
      const eventB = await appendEvent(tx, {
        gameId: shellB.gameId,
        eventType: "Y",
      });

      expect(eventA.sequence).toBe("1");
      expect(eventB.sequence).toBe("1");
    });
  });
});
