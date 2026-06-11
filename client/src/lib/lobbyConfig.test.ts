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
  slotMapUnlockOffsetsSeconds: [0],
  deadWallSize: 14,
  teamAssignmentMode: "pick",
  visibilityMode: "both",
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
      slotUnlockOffsetsSeconds: [0],
      slotMapUnlockOffsetsSeconds: [0],
      deadWallSize: 14,
      teamAssignmentMode: "pick",
      visibilityMode: "both",
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

  it("detects pending visibility mode changes", () => {
    expect(
      lobbyConfigHasPendingChanges(
        { ...baseConfig, visibilityMode: "slot" },
        baseConfig,
      ),
    ).toBe(true);
  });

  it("omits phase knobs from the patch when visibility mode excludes phase", () => {
    const patch = lobbyConfigPatchFromDto({ ...baseConfig, visibilityMode: "slot" });
    expect(patch).not.toHaveProperty("visibilityPhaseCount");
    expect(patch).not.toHaveProperty("visibilityPhaseIntervalSeconds");
    expect(patch.slotUnlockOffsetsSeconds).toEqual([0]);
  });

  it("omits slot knobs from the patch when visibility mode excludes slot", () => {
    const patch = lobbyConfigPatchFromDto({ ...baseConfig, visibilityMode: "phase" });
    expect(patch).not.toHaveProperty("slotUnlockOffsetsSeconds");
    expect(patch).not.toHaveProperty("slotMapUnlockOffsetsSeconds");
    expect(patch.visibilityPhaseCount).toBe(4);
  });
});
