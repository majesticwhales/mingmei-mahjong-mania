import type { LobbyConfigDto, LobbyConfigPatch } from "../wire/lobby";

const PATCH_KEYS = [
  "mapTemplateId",
  "gameDurationSeconds",
  "visibilityPhaseIntervalSeconds",
  "visibilityPhaseCount",
  "slotsPerNode",
  "slotUnlockOffsetsSeconds",
  "slotMapVisible",
  "deadWallSize",
  "teamAssignmentMode",
  "visibilityMode",
  "minPlayersToStart",
  "defaultStartNodeCode",
] as const satisfies ReadonlyArray<keyof LobbyConfigPatch>;

export function lobbyConfigPatchFromDto(config: LobbyConfigDto): LobbyConfigPatch {
  return {
    mapTemplateId: config.mapTemplateId,
    gameDurationSeconds: config.gameDurationSeconds,
    visibilityPhaseIntervalSeconds: config.visibilityPhaseIntervalSeconds,
    visibilityPhaseCount: config.visibilityPhaseCount,
    slotsPerNode: config.slotsPerNode,
    slotUnlockOffsetsSeconds: config.slotUnlockOffsetsSeconds,
    slotMapVisible: config.slotMapVisible,
    deadWallSize: config.deadWallSize,
    teamAssignmentMode: config.teamAssignmentMode,
    visibilityMode: config.visibilityMode,
    minPlayersToStart: config.minPlayersToStart,
    defaultStartNodeCode: config.defaultStartNodeCode,
  };
}

export function lobbyConfigHasPendingChanges(
  draft: LobbyConfigDto,
  saved: LobbyConfigDto,
): boolean {
  return PATCH_KEYS.some((key) => draft[key] !== saved[key]);
}
