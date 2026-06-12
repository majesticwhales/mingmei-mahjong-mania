// SERVER SOURCE: server/src/services/lobby-serializer.ts, lobby-notification-service.ts

export type LobbyStatus = "waiting" | "starting" | "closed";
export type TeamAssignmentMode = "pick" | "random" | "mixed";
export type VisibilityMode = "none" | "phase" | "slot" | "both";

export interface LobbyMemberDto {
  userId: string;
  username: string;
  joinedAt: string;
  teamSlot: number | null;
}

export interface LobbyReadinessDto {
  ready: boolean;
  reasons: string[];
  memberCount: number;
  minPlayersToStart: number;
  soloStartAllowed: boolean;
  playersPerTeam: Record<string, number>;
  missingTeams: number[];
  unassignedCount: number;
}

export interface LobbyConfigDto {
  mapTemplateId: string;
  gameDurationSeconds: number;
  visibilityPhaseIntervalSeconds: number;
  visibilityPhaseCount: number;
  slotsPerNode: number;
  slotUnlockOffsetsSeconds: number[];
  /**
   * Per-slot map-reveal offsets in seconds from game start (Phase L
   * §3.13). Length === `slotsPerNode`. Entry `[0]` is always `0`. Each
   * entry is either a non-negative integer (map reveal at that offset)
   * or `null` (slot is never on the map — the "out of play on map"
   * tier). Independent of `slotUnlockOffsetsSeconds`, with the
   * server-enforced relationship `map[i] === null || map[i] >= claim[i]`.
   */
  slotMapUnlockOffsetsSeconds: Array<number | null>;
  deadWallSize: number;
  /**
   * Per-(team, challenge) cooldown floor in seconds applied after a
   * challenge resolves. Snapshotted to `games.challenge_cooldown_seconds`
   * at start; production preset = 300, test preset = 5. See TDD_server §3.8.
   */
  challengeCooldownSeconds: number;
  teamAssignmentMode: TeamAssignmentMode;
  visibilityMode: VisibilityMode;
  minPlayersToStart: number;
  defaultStartNodeCode: string | null;
  configUpdatedAt: string | null;
}

export interface LobbyNotificationDto {
  id: string;
  atSeconds: number;
  template: string;
  data: Record<string, unknown> | null;
}

export interface LobbyDetailDto {
  id: string;
  status: LobbyStatus;
  hostUserId: string;
  /** Id of the game spawned from this lobby once the host starts it; null while still `waiting`. */
  gameId: string | null;
  config: LobbyConfigDto;
  members: LobbyMemberDto[];
  readiness: LobbyReadinessDto;
  notifications: LobbyNotificationDto[];
}

export interface CreateLobbyInput {
  isTestGame?: boolean;
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  visibilityPhaseCount?: number;
  slotsPerNode?: number;
  deadWallSize?: number;
  /** See `LobbyConfigDto.challengeCooldownSeconds`. Defaults to the preset value. */
  challengeCooldownSeconds?: number;
  teamAssignmentMode?: TeamAssignmentMode;
  visibilityMode?: VisibilityMode;
  minPlayersToStart?: number;
  defaultStartNodeCode?: string | null;
}

export type LobbyConfigPatch = Partial<LobbyConfigDto>;

export interface MapTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
}

export interface StartLobbyResponse {
  gameId: string;
  status: "active";
}
