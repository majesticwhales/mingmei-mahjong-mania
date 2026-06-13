import { describe, expect, it } from "vitest";
import { gameReducer } from "./reducer";
import type { GameStateProjection } from "../../wire/projection";

const projection: GameStateProjection = {
  gameId: "g1",
  status: "active",
  endsAt: new Date().toISOString(),
  nextVisibilityChangeAt: null,
  visibilityPhase: 0,
  visibilityPhaseCount: 3,
  phaseDrivenSlotMap: false,
  mapNodes: [],
  mapLines: [],
  mapEdges: [],
  atStation: null,
  handTiles: [],
  recentEvents: [{ sequence: 1, type: "CHECK_IN", teamCode: "A", at: "2026-01-01T00:00:00.000Z" }],
  roundWind: 1,
  seatWind: 1,
  doraIndicator: null,
  handCompleted: null,
  teamsCompleted: [],
  endReason: null,
};

describe("gameReducer", () => {
  it("loads game state", () => {
    const next = gameReducer(
      { status: "loading", id: "g1" },
      { type: "game/loaded", id: "g1", gameTeamId: "t1", projection },
    );
    expect(next.status).toBe("active");
    if (next.status === "active") {
      expect(next.eventLog).toHaveLength(1);
    }
  });

  it("dedupes events", () => {
    const active = gameReducer(
      { status: "loading", id: "g1" },
      { type: "game/loaded", id: "g1", gameTeamId: "t1", projection },
    );
    const next = gameReducer(active, {
      type: "game/event",
      event: { sequence: 1, type: "CHECK_IN", teamCode: "A", at: "2026-01-01T00:00:00.000Z" },
    });
    if (next.status === "active") {
      expect(next.eventLog).toHaveLength(1);
    }
  });

  it("merges projection on resync without clearing notifications", () => {
    const active = gameReducer(
      { status: "loading", id: "g1" },
      { type: "game/loaded", id: "g1", gameTeamId: "t1", projection },
    );
    const withToast =
      active.status === "active"
        ? gameReducer(active, {
          type: "game/notification",
          template: "test",
          at: "2026-01-01T00:00:00.000Z",
        })
        : active;
    const resynced = gameReducer(withToast, {
      type: "game/resynced",
      gameTeamId: "t1",
      projection: {
        ...projection,
        recentEvents: [
          { sequence: 1, type: "CHECK_IN", teamCode: "A", at: "2026-01-01T00:00:00.000Z" },
          { sequence: 2, type: "CHECK_OUT", teamCode: "A", at: "2026-01-01T00:01:00.000Z" },
        ],
      },
    });
    if (resynced.status === "active") {
      expect(resynced.eventLog).toHaveLength(2);
      expect(resynced.notifications).toHaveLength(1);
    }
  });

  it("ignores game.state updates for a different game", () => {
    const active = gameReducer(
      { status: "loading", id: "g1" },
      { type: "game/loaded", id: "g1", gameTeamId: "t1", projection },
    );
    const next = gameReducer(active, {
      type: "game/state",
      projection: { ...projection, gameId: "g2", status: "ended" },
    });
    if (next.status === "active") {
      expect(next.projection.status).toBe("active");
      expect(next.projection.gameId).toBe("g1");
    }
  });
});
