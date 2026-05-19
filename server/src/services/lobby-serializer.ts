import type { Lobby, LobbyStatus, TeamAssignmentMode } from "../models/lobby.ts";
import type { LobbyMember } from "../models/lobby-member.ts";
import type { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import type { User } from "../models/user.ts";
import {
  canStaffMissingTeamsWithPool,
  emptyTeamCounts,
  GAME_TEAM_SLOTS,
} from "./even-team-assignment.ts";

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
  /** Player count per team slot 1–4 (picked members only; random pool not included). */
  playersPerTeam: Record<string, number>;
  /** Team slots 1–4 with zero picked players. */
  missingTeams: number[];
  /** Members waiting for random assignment at start. */
  unassignedCount: number;
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

function countPlayersPerTeam(
  members: LobbyMember[],
  assignmentByUser: Map<string, number | null | undefined>,
): Record<string, number> {
  const counts = emptyTeamCounts();
  for (const member of members) {
    const slot = assignmentByUser.get(member.userId);
    if (slot != null && slot >= 1 && slot <= 4) {
      counts[String(slot)] += 1;
    }
  }
  return counts;
}

function countUnassigned(
  members: LobbyMember[],
  assignmentByUser: Map<string, number | null | undefined>,
): number {
  return members.filter((m) => {
    const slot = assignmentByUser.get(m.userId);
    return slot == null || slot < 1 || slot > 4;
  }).length;
}

export function computeReadiness(
  lobby: Lobby,
  members: LobbyMember[],
  teamAssignments: LobbyTeamAssignment[],
): LobbyReadinessDto {
  const reasons: string[] = [];
  const memberCount = members.length;
  const minPlayersToStart = lobby.minPlayersToStart;
  const mode = lobby.teamAssignmentMode;

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
  const playersPerTeam = countPlayersPerTeam(members, assignmentByUser);
  const unassignedCount = countUnassigned(members, assignmentByUser);
  const missingTeams = GAME_TEAM_SLOTS.filter(
    (team) => playersPerTeam[String(team)] === 0,
  );

  if (mode === "pick") {
    if (unassignedCount > 0) {
      reasons.push("All members must pick a team (1–4)");
    }
    if (missingTeams.length > 0) {
      reasons.push(
        `Each team needs at least one player (missing: ${missingTeams.join(", ")})`,
      );
    }
  } else if (mode === "random") {
    if (memberCount < GAME_TEAM_SLOTS.length) {
      reasons.push(
        `Need at least ${GAME_TEAM_SLOTS.length} players for random team assignment`,
      );
    }
    // At start, assignTeamsEvenly guarantees each team gets ≥1 when n ≥ 4
  } else if (mode === "mixed") {
    const { ok, missingTeams: stillMissing } = canStaffMissingTeamsWithPool(
      playersPerTeam,
      unassignedCount,
    );
    if (!ok) {
      reasons.push(
        `Not enough unassigned players to fill teams ${stillMissing.join(", ")} (pick a team or wait for random assign at start)`,
      );
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
    memberCount,
    minPlayersToStart,
    playersPerTeam,
    missingTeams: [...missingTeams],
    unassignedCount,
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
