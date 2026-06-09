import { describe, expect, it } from "vitest";
import { gameReducer } from "./reducer";
import type { GameStateProjection } from "../../wire/projection";

const projection: GameStateProjection = {
  gameId: "g1",
  status: "active",
  endsAt: new Date().toISOString(),
  nextVisibilityChangeAt: null,
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
});
