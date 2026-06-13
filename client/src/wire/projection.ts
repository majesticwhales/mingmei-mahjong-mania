// SERVER SOURCE: server/src/projections/game-state.ts, recent-events.ts

export type GameStatus = "active" | "ending" | "ended";

/**
 * Reason the game ended. Mirrors `GameSummaryDto.endReason` (see
 * `wire/summary.ts`) and `GameEndReason` on the server; both surfaces
 * decode the same `GAME_ENDED` event payload, so any new value must be
 * added in lockstep.
 */
export type GameEndReason = "timer" | "all_teams_completed" | "manual";

export interface TileDto {
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

/**
 * Phase L §3.13: server-resolved per-slot map view. The server emits
 * one entry per slot the node has (`0 .. slots_per_node - 1`), in
 * ascending order. UI rendering paths must read `visible` / `locked`
 * directly — never re-derive them from `visibilityPhase` /
 * `phaseDrivenSlotMap` (those survive as telemetry only).
 *
 * - `tile` is the placement at that slot iff the slot is visible; the
 *   server `null`s it out otherwise (hidden slot, empty slot, or both).
 * - `visible` is the server-resolved gate (phase fog ∧ map-reveal
 *   timer, with mode-off layers short-circuited).
 * - `locked` reflects the claim-unlock timer. The server enforces
 *   `mapOffset[k] IS NULL OR mapOffset[k] >= claimOffset[k]`, so
 *   `visible: true` implies `locked: false`; `locked` is informative
 *   primarily when `visible: false` (lets the client render a
 *   "claim opens in X" countdown without duplicating the math).
 */
export interface MapNodeTileDto {
  slotIndex: number;
  tile: TileDto | null;
  visible: boolean;
  locked: boolean;
}

export interface MapNodeDto {
  id: string;
  code: string;
  name: string;
  coordinateX: number;
  coordinateY: number;
  lineIds: string[];
  labelAnchor: string;
  labelRotate: number | null;
  isInterchange: boolean;
  latitude: number;
  longitude: number;
  /**
   * Phase L §3.13: exhaustive per-slot view (`tiles.length` always
   * equals `slots_per_node`). UI must read `tiles[].visible` /
   * `tiles[].locked` directly rather than re-deriving from the
   * telemetry-only `visibilityPhase` / `phaseDrivenSlotMap` fields.
   */
  tiles: MapNodeTileDto[];
}

export interface MapLineDto {
  code: string;
  name: string | null;
  shortName: string | null;
  color: string | null;
  sortOrder: number;
  renderMetadata: Record<string, unknown> | null;
}

export interface MapEdgeDto {
  fromNodeId: string;
  toNodeId: string;
}

export interface AtStationChallengeDto {
  challengeId: string;
  title: string;
  description: string | null;
  flavorText: string | null;
  /**
   * Optional illustration URL from `challenges.image_url`. Typically an
   * absolute path served by the client static bundle (e.g.
   * `/challenges/bay.png` from `client/public/challenges/`); external
   * URLs are accepted verbatim. `null` when the challenge has no
   * illustration. Always present on the wire — `ChallengeModal`
   * conditionally renders the `<img>` based on null vs. value.
   */
  imageUrl: string | null;
  status: "available" | "in_progress" | "cooldown";
  instanceId?: string;
  cooldownUntil?: string;
}

export interface AtStationDto {
  nodeId: string;
  code: string;
  /**
   * Phase L Chunk 4 B-2: exhaustive per-slot view. Same shape and
   * server-side fog/timer redaction as `mapNodes[teamNode].tiles[]`
   * — when the team is at this node, `atStation.tiles[k]` is the
   * identical entry from `mapNodes[teamNode].tiles[k]`. The pre-L4
   * `tile?: TileDto` (single-slot) and `tiles?: SlotTileDto[]`
   * (visible-only) shapes are gone; UI consumers read
   * `tile / visible / locked` directly per slot.
   */
  tiles: MapNodeTileDto[];
  currentChallenge?: AtStationChallengeDto | null;
  pendingSwapCredit?: boolean;
}

export interface HandTileDto extends TileDto {
  slotIndex: number;
}

export interface RecentEventDto {
  sequence: number;
  type: string;
  teamCode: string | null;
  at: string;
  nodeCode?: string;
  nodeName?: string;
  slotIndex?: number;
  handTileDisplayName?: string;
  stationTileDisplayName?: string;
  hasPhoto?: boolean;
  geolocationWarning?: boolean;
  phase?: number;
  visibilityPhaseCount?: number;
  template?: string;
  challengeId?: string;
  instanceId?: string;
  /**
   * Phase J: present on `CLAIM_WIN` rows only, and only on the claiming
   * team's projection. Other teams see the row without a score; the full
   * per-team breakdown lands at game end via the summary endpoint.
   */
  finalPoints?: number;
}

export interface FinalYakuDto {
  name: string;
  han: number;
}

/**
 * Phase I scoring identity. Used inside `handAnalysis.waits[].tile` to
 * identify a wait tile by `(suit, rank, copyIndex)` so the client can
 * cross-reference it against the station tiles in `atStation`.
 */
export interface ScoringTileDto {
  suit: string;
  rank: number;
  copyIndex: number;
}

/**
 * Phase I — a single wait the scoring orchestrator surfaces for a
 * 13-tile tenpai hand. Mirrors `AnalyzedWait` in
 * `server/src/scoring/orchestrator.ts`. Consumed by `ClaimWinModal`
 * to decide which station tiles flip the affordance from "Swap" to
 * "Claim".
 */
export interface AnalyzedWaitDto {
  tile: ScoringTileDto;
  han: number;
  fu: number;
  points: number;
  yaku: FinalYakuDto[];
  isYakuman: boolean;
}

/**
 * Phase I — full output of `analyzeHand` for the team's hand. Present
 * when the hand has 13 or 14 tiles (the only sizes the scoring module
 * supports); `undefined` otherwise.
 */
export interface AnalyzeHandResultDto {
  /** `-1` winning, `0` tenpai, `1+` away from tenpai. */
  shanten: number;
  /** Present when `shanten <= 0`; absent otherwise. */
  waits?: AnalyzedWaitDto[];
}

/**
 * Phase J: snapshot of the requesting team's completed hand. Populated
 * only on the projection of the team that successfully `CLAIM_WIN`-ed;
 * remains `null` for other teams' projections.
 */
export interface HandCompletedDto {
  completedAt: string;
  winningTile: TileDto;
  winningNodeCode: string;
  winningNodeName: string;
  finalHan: number;
  finalFu: number;
  finalPoints: number;
  finalYaku: FinalYakuDto[];
}

/**
 * Phase J: completion-order entry advertising which teams have claimed
 * a winning hand. Public — every projection carries the full list.
 */
export interface TeamsCompletedEntryDto {
  gameTeamId: string;
  teamCode: string;
  completedAt: string;
}

export interface GameStateProjection {
  gameId: string;
  status: GameStatus;
  endsAt: string;
  /**
   * Reason the game ended (set whenever `status` is `"ending"` or
   * `"ended"`; `null` for `"active"`). Lets the wrap-up screen render
   * reason-specific copy without waiting on the summary endpoint, which
   * is only available after `status === "ended"`. Mirrors
   * `GameSummaryDto.endReason` on the post-game scoreboard.
   */
  endReason: GameEndReason | null;
  nextVisibilityChangeAt: string | null;
  /**
   * **Telemetry only as of Phase L §3.13.** Surfaces "phase k of n"
   * copy in the visibility countdown banner / event log. UI rendering
   * paths must read `mapNodes[].tiles[].visible` directly rather than
   * re-deriving per-slot visibility from this field.
   */
  visibilityPhase: number;
  /**
   * **Telemetry only as of Phase L §3.13.** Snapshotted phase count;
   * equals `slotsPerNode` in the tile-slot mode. See `visibilityPhase`.
   */
  visibilityPhaseCount: number;
  /**
   * **Telemetry only as of Phase L §3.13.** True when the projection's
   * per-slot map gate used a phase-driven path. UI must not re-derive
   * visibility from this — read `mapNodes[].tiles[].visible` directly.
   */
  phaseDrivenSlotMap: boolean;
  mapNodes: MapNodeDto[];
  mapLines: MapLineDto[];
  mapEdges: MapEdgeDto[];
  atStation: AtStationDto | null;
  handTiles: HandTileDto[];
  recentEvents: RecentEventDto[];
  roundWind: number;
  seatWind: number;
  doraIndicator: TileDto | null;
  handAnalysis?: AnalyzeHandResultDto;
  /** Phase J: requesting team's hand-completed snapshot, or `null` if not completed. */
  handCompleted: HandCompletedDto | null;
  /** Phase J: completion-order roster across every team in the game. */
  teamsCompleted: TeamsCompletedEntryDto[];
}
