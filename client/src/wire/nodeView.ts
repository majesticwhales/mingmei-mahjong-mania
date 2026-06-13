// SERVER SOURCE: server/src/services/node-view.ts

import type { AtStationChallengeDto, MapNodeTileDto } from "./projection";

/**
 * Phase L §3.14 — `GET /api/games/:id/nodes/:nodeId/view`.
 *
 * Wire shape for the StationPanel's REST surface. Mirrors the server's
 * `NodeViewDto` 1:1. The two channels (socket `game.state.atStation` +
 * this REST endpoint) are required to emit byte-identical `tiles[]`
 * for the same node + team + clock window — the alias on
 * `NodeViewTileDto` documents the relationship at the wire-name level.
 *
 * See [server TDD §3.14](../../../docs/TDD_server.md#314-node-view-endpoint)
 * for the full contract; [§6.3](../../../docs/TDD_server.md#63-atstation)
 * documents the at-station privilege that this surface inherits.
 */

/**
 * Per-slot tile shape. Identical to `MapNodeTileDto` on the projection
 * surface — same `slotIndex` / `tile` / `visible` / `locked` quartet,
 * same at-station privilege when the requester is checked in at this
 * node. The alias keeps the wire name aligned with the endpoint
 * (`/nodes/.../view`) without forking the type.
 */
export type NodeViewTileDto = MapNodeTileDto;

/**
 * Every command the StationPanel might surface. Keep in sync with
 * `AvailableActionType` on the server; adding a new command requires
 * growing this union, the reason union below, and the action-rendering
 * branch in `StationPanel`.
 */
export type AvailableActionType =
  | "check_in"
  | "check_out"
  | "swap_tile"
  | "swap_location_tiles"
  | "start_challenge"
  | "claim_win";

/**
 * Stable disable-reason codes. The client uses these via a lookup
 * table on the StationPanel — adding a new code requires both a
 * server-side update and a client-side string. Code names mirror the
 * engine handlers' `409` error codes so cross-referencing a disabled
 * action with the rejected command is straightforward.
 */
export type AvailableActionReason =
  | "not_checked_in"
  | "wrong_node"
  | "slot_locked"
  | "hand_completed"
  | "swap_credit_required"
  | "challenge_in_progress"
  | "challenge_on_cooldown"
  | "no_challenge_at_station"
  | "no_winning_wait"
  | "not_tenpai"
  | "game_ended";

export interface AvailableActionDto {
  action: AvailableActionType;
  enabled: boolean;
  /**
   * Present iff `enabled === false`. Encodes the **first** failing
   * precondition (handlers stop on the first rejection too), so the
   * client renders one tooltip per disabled action without juggling a
   * priority list.
   */
  reason?: AvailableActionReason;
}

export interface NodeViewDto {
  nodeId: string;
  code: string;
  name: string;
  lineIds: string[];
  isInterchange: boolean;
  /** Length always equals `games.slots_per_node`; identical contract to `MapNodeDto.tiles[]`. */
  tiles: NodeViewTileDto[];
  currentChallenge: AtStationChallengeDto | null;
  availableActions: AvailableActionDto[];
}
