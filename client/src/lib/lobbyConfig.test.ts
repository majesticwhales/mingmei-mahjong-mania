import { describe, expect, it } from "vitest";
import { lobbyConfigHasPendingChanges, lobbyConfigPatchFromDto } from "./lobbyConfig";
import type { LobbyConfigDto } from "../wire/lobby";

const baseConfig: LobbyConfigDto = {
  mapTemplateId: "map-1",
  gameDurationSeconds: 7200,
  visibilityPhaseIntervalSeconds: 1800,
  visibilityPhaseCount: 4,
  slotsPerNode: 1,
  slotUnlockOffsetsSeconds: [0],
  slotMapVisible: [true],
  deadWallSize: 14,
  teamAssignmentMode: "pick",
  minPlayersToStart: 4,
  defaultStartNodeCode: "union",
  configUpdatedAt: "2026-01-01T00:00:00.000Z",
};

describe("lobbyConfig", () => {
  it("builds a patch without read-only fields", () => {
    expect(lobbyConfigPatchFromDto(baseConfig)).toEqual({
      mapTemplateId: "map-1",
      gameDurationSeconds: 7200,
      visibilityPhaseIntervalSeconds: 1800,
      visibilityPhaseCount: 4,
      slotsPerNode: 1,
      deadWallSize: 14,
      teamAssignmentMode: "pick",
      minPlayersToStart: 4,
      defaultStartNodeCode: "union",
    });
  });

  it("detects pending duration changes", () => {
    expect(
      lobbyConfigHasPendingChanges(
        { ...baseConfig, gameDurationSeconds: 240 },
        baseConfig,
      ),
    ).toBe(true);
  });
});
