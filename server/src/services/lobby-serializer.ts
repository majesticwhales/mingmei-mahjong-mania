import type { Lobby, LobbyStatus, TeamAssignmentMode } from "../models/lobby.ts";
import type { LobbyMember } from "../models/lobby-member.ts";
import type { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import type { User } from "../models/user.ts";

export interface LobbyMemberDto {
  userId: string;
  username: string;
  joinedAt: Date;
  teamSlot: number | null;
}

export interface LobbyReadinessDto {
  ready: boolean;
  reasons: string[];
  memberCount: number;
  minPlayersToStart: number;
}

export interface LobbyConfigDto {
  mapTemplateId: string;
  gameDurationSeconds: number;
  visibilityPhaseIntervalSeconds: number;
  teamAssignmentMode: TeamAssignmentMode;
  minPlayersToStart: number;
  configUpdatedAt: Date | null;
}

export interface LobbyDetailDto {
  id: string;
  status: LobbyStatus;
  hostUserId: string;
  config: LobbyConfigDto;
  members: LobbyMemberDto[];
  readiness: LobbyReadinessDto;
}

export function computeReadiness(
  lobby: Lobby,
  members: LobbyMember[],
  teamAssignments: LobbyTeamAssignment[],
): LobbyReadinessDto {
  const reasons: string[] = [];
  const memberCount = members.length;
  const minPlayersToStart = lobby.minPlayersToStart;

  if (lobby.status !== "waiting") {
    reasons.push(`Lobby status is "${lobby.status}", not waiting`);
  }
  if (memberCount < minPlayersToStart) {
    reasons.push(
      `Need at least ${minPlayersToStart} players (${memberCount} joined)`,
    );
  }

  const assignmentByUser = new Map(
    teamAssignments.map((a) => [a.userId, a.teamSlot]),
  );
  for (const member of members) {
    const slot = assignmentByUser.get(member.userId);
    if (slot == null || slot < 1 || slot > 4) {
      reasons.push("All members must pick a team (slots 1–4)");
      break;
    }
  }

  const slotsUsed = teamAssignments
    .map((a) => a.teamSlot)
    .filter((s): s is number => s != null && s >= 1 && s <= 4);
  const uniqueSlots = new Set(slotsUsed);
  if (uniqueSlots.size !== slotsUsed.length) {
    reasons.push("Duplicate team slots assigned");
  }

  return {
    ready: reasons.length === 0,
    reasons,
    memberCount,
    minPlayersToStart,
  };
}

export function serializeLobbyDetail(
  lobby: Lobby,
  members: LobbyMember[],
  teamAssignments: LobbyTeamAssignment[],
  usersById: Map<string, User>,
): LobbyDetailDto {
  const assignmentByUser = new Map(
    teamAssignments.map((a) => [a.userId, a.teamSlot]),
  );

  const memberDtos: LobbyMemberDto[] = members.map((member) => {
    const user = usersById.get(member.userId);
    return {
      userId: member.userId,
      username: user?.username ?? "unknown",
      joinedAt: member.joinedAt,
      teamSlot: assignmentByUser.get(member.userId) ?? null,
    };
  });

  memberDtos.sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
  );

  return {
    id: lobby.id,
    status: lobby.status,
    hostUserId: lobby.hostUserId,
    config: {
      mapTemplateId: lobby.mapTemplateId,
      gameDurationSeconds: lobby.gameDurationSeconds,
      visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
      teamAssignmentMode: lobby.teamAssignmentMode,
      minPlayersToStart: lobby.minPlayersToStart,
      configUpdatedAt: lobby.configUpdatedAt,
    },
    members: memberDtos,
    readiness: computeReadiness(lobby, members, teamAssignments),
  };
}
