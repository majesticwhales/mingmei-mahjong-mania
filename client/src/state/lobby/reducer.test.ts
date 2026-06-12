import { describe, expect, it } from "vitest";
import { lobbyReducer } from "./reducer";
import type { LobbyDetailDto } from "../../wire/lobby";

const lobby: LobbyDetailDto = {
  id: "l1",
  status: "waiting",
  hostUserId: "host",
  gameId: null,
  config: {
    mapTemplateId: "m1",
    gameDurationSeconds: 3600,
    visibilityPhaseIntervalSeconds: 600,
    visibilityPhaseCount: 4,
    slotsPerNode: 1,
    slotUnlockOffsetsSeconds: [0],
    slotMapUnlockOffsetsSeconds: [0],
    deadWallSize: 14,
    challengeCooldownSeconds: 300,
    teamAssignmentMode: "pick",
    visibilityMode: "both",
    minPlayersToStart: 4,
    defaultStartNodeCode: null,
    configUpdatedAt: null,
  },
  members: [{ userId: "u1", username: "alice", joinedAt: "2026-01-01", teamSlot: null }],
  readiness: {
    ready: false,
    reasons: [],
    memberCount: 1,
    minPlayersToStart: 4,
    soloStartAllowed: false,
    playersPerTeam: { "1": 0, "2": 0, "3": 0, "4": 0 },
    missingTeams: [1, 2, 3, 4],
    unassignedCount: 1,
  },
  notifications: [],
};

describe("lobbyReducer", () => {
  it("loads lobby", () => {
    expect(lobbyReducer({ status: "absent" }, { type: "lobby/load", id: "l1" })).toEqual({
      status: "loading",
      id: "l1",
    });
  });

  it("optimistically picks team", () => {
    const ready = { status: "ready" as const, id: "l1", lobby };
    const next = lobbyReducer(ready, {
      type: "lobby/team/optimistic",
      userId: "u1",
      teamSlot: 2,
      previousTeamSlot: null,
    });
    if (next.status === "ready") {
      expect(next.lobby.members[0].teamSlot).toBe(2);
    }
  });
});
