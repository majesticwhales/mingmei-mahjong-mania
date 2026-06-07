import type { GameStateProjection } from "../../wire/projection";

export function makeProjection(overrides: Partial<GameStateProjection> = {}): GameStateProjection {
  return {
    gameId: "game-1",
    status: "active",
    endsAt: new Date(Date.now() + 3600_000).toISOString(),
    nextVisibilityChangeAt: null,
    mapNodes: [],
    mapLines: [],
    mapEdges: [],
    atStation: null,
    handTiles: [],
    recentEvents: [],
    roundWind: 1,
    seatWind: 1,
    doraIndicator: null,
    ...overrides,
  };
}
