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
  slotMapVisible: boolean[];
  deadWallSize: number;
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
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  visibilityPhaseCount?: number;
  slotsPerNode?: number;
  deadWallSize?: number;
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
