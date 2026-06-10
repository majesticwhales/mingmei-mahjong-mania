// SERVER SOURCE: server/src/projections/game-state.ts, recent-events.ts

export type GameStatus = "active" | "ending" | "ended";

export interface TileDto {
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

export interface SlotTileDto {
  slotIndex: number;
  tile: TileDto;
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
  tile?: TileDto;
  tiles?: SlotTileDto[];
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

export interface AtStationDto {
  nodeId: string;
  code: string;
  tile?: TileDto;
  tiles?: SlotTileDto[];
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
  slotIndex?: number;
  hasPhoto?: boolean;
  geolocationWarning?: boolean;
  phase?: number;
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
  nextVisibilityChangeAt: string | null;
  visibilityPhase: number;
  visibilityPhaseCount: number;
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
