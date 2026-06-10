import type {
  LobbyConfigDto,
  LobbyConfigPatch,
  VisibilityMode,
} from "../wire/lobby";

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

function visibilityIncludes(
  mode: VisibilityMode,
  layer: "phase" | "slot",
): boolean {
  if (mode === "both") return true;
  if (mode === "none") return false;
  return mode === layer;
}

/**
 * Build a PATCH body from the form draft. Locked knobs for the active
 * visibility mode are omitted — the server rejects explicit phase fields
 * in `slot` mode (and non-trivial slot arrays in `phase` mode).
 */
export function lobbyConfigPatchFromDto(config: LobbyConfigDto): LobbyConfigPatch {
  const patch: LobbyConfigPatch = {
    mapTemplateId: config.mapTemplateId,
    gameDurationSeconds: config.gameDurationSeconds,
    slotsPerNode: config.slotsPerNode,
    deadWallSize: config.deadWallSize,
    teamAssignmentMode: config.teamAssignmentMode,
    visibilityMode: config.visibilityMode,
    minPlayersToStart: config.minPlayersToStart,
    defaultStartNodeCode: config.defaultStartNodeCode,
  };

  if (visibilityIncludes(config.visibilityMode, "phase")) {
    patch.visibilityPhaseIntervalSeconds = config.visibilityPhaseIntervalSeconds;
    patch.visibilityPhaseCount = config.visibilityPhaseCount;
  }

  if (visibilityIncludes(config.visibilityMode, "slot")) {
    patch.slotUnlockOffsetsSeconds = config.slotUnlockOffsetsSeconds;
    patch.slotMapVisible = config.slotMapVisible;
  }

  return patch;
}

export function lobbyConfigHasPendingChanges(
  draft: LobbyConfigDto,
  saved: LobbyConfigDto,
): boolean {
  return PATCH_KEYS.some((key) => draft[key] !== saved[key]);
}
