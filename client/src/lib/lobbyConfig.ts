import type { LobbyConfigDto, LobbyConfigPatch } from "../wire/lobby";

const PATCH_KEYS = [
  "mapTemplateId",
  "gameDurationSeconds",
  "visibilityPhaseIntervalSeconds",
  "visibilityPhaseCount",
  "slotsPerNode",
  "deadWallSize",
  "teamAssignmentMode",
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
    deadWallSize: config.deadWallSize,
    teamAssignmentMode: config.teamAssignmentMode,
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
