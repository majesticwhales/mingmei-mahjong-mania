/**
 * Per-game visibility mode (TDD §3.2 / §3.3).
 *
 * Picks which of the two visibility layers are active for a game. The
 * mode is set on the lobby, snapshotted to `games.visibility_mode` at
 * start, and consulted at three places downstream:
 *
 *   - `game-start-service` skips `bootstrapGameVisibility` when phase is off
 *     (no `game_node_visibility_groups` / `game_team_home_groups` /
 *     phase-0 `game_location_team_visibility` rows seeded).
 *   - `game-schedule-service` skips `VISIBILITY_PHASE_ADVANCE` jobs when
 *     phase is off; skips `SLOT_UNLOCKED` / `SLOT_MAP_UNLOCKED` jobs when
 *     slot is off.
 *   - The `game.state` projection short-circuits the corresponding
 *     visibility gate when its layer is off.
 *
 * Lobby validation (chunk 2) additionally locks the irrelevant knobs:
 * a lobby in `slot` mode cannot edit `visibility_phase_count` /
 * `visibility_phase_interval_seconds`; a lobby in `phase` mode cannot
 * set non-zero / null entries in `slot_unlock_offsets_seconds[k>0]` or
 * `slot_map_unlock_offsets_seconds[k>0]`. This keeps mode + knobs
 * internally consistent.
 *
 * No DB access here; pure types + a single bit-check helper.
 */

export const VISIBILITY_MODES = ["none", "phase", "slot", "both"] as const;

export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

export type VisibilityLayer = "phase" | "slot";

export function isVisibilityMode(value: unknown): value is VisibilityMode {
  return (
    typeof value === "string" &&
    (VISIBILITY_MODES as readonly string[]).includes(value)
  );
}

/**
 * Does `mode` activate `layer`? `both` activates both; `none` activates
 * neither; `phase` / `slot` activate only the layer they're named after.
 * Inlined at every call site as
 *   `if (visibilityIncludes(game.visibilityMode, "phase")) { ... }`
 * so the branching reads naturally in the engine/scheduler/projection.
 */
export function visibilityIncludes(
  mode: VisibilityMode,
  layer: VisibilityLayer,
): boolean {
  if (mode === "both") return true;
  if (mode === "none") return false;
  return mode === layer;
}
