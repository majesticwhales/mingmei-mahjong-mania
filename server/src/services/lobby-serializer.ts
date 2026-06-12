import type { VisibilityMode } from "../game/visibility-mode.ts";
import { isRelaxLobbyStart } from "../lib/dev-flags.ts";
import type { Lobby, LobbyStatus, TeamAssignmentMode } from "../models/lobby.ts";
import type { LobbyMember } from "../models/lobby-member.ts";
import type { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import type { User } from "../models/user.ts";
import {
  canStaffMissingTeamsWithPool,
  emptyTeamCounts,
  GAME_TEAM_SLOTS,
} from "./even-team-assignment.ts";
import type { LobbyNotificationDto } from "./lobby-notification-service.ts";

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
  /** True when dev relax or an allowlisted host may start with fewer players. */
  soloStartAllowed: boolean;
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
  /** Number of visibility phases / groups for this lobby (snapshotted to `games.visibility_phase_count`). */
  visibilityPhaseCount: number;
  /** Tile-slot capacity at each node (snapshotted to `games.slots_per_node`). */
  slotsPerNode: number;
  /**
   * Per-slot unlock offsets in seconds from game start. Length equals
   * `slotsPerNode`. Entry `[0]` is always `0`. See TDD §3.3 / §4.1.
   * Snapshotted to `games.slot_unlock_offsets_seconds` at start.
   */
  slotUnlockOffsetsSeconds: number[];
  /**
   * Per-slot map-reveal offsets in seconds from game start (Phase L
   * §3.13). Length equals `slotsPerNode`. Entry `[0]` is always `0`.
   * Each entry is either a non-negative integer (map reveal at offset)
   * or `null` (slot is never on the map regardless of timer — the
   * "out of play on map" tier). Snapshotted to
   * `games.slot_map_unlock_offsets_seconds`.
   */
  slotMapUnlockOffsetsSeconds: Array<number | null>;
  /**
   * Size of the per-game dead wall (number of tiles parked outside nodes
   * and team hands). Snapshotted to `games.dead_wall_size` at start. The
   * first dead-wall tile is the dora indicator consumed by the scoring
   * module. See TDD §3.9.
   */
  deadWallSize: number;
  /**
   * Per-(team, challenge) cooldown floor in seconds applied after a
   * challenge resolves. Snapshotted to `games.challenge_cooldown_seconds`
   * at start; defaults to the chosen preset (production: 300 / test: 5).
   * See TDD §3.8.
   */
  challengeCooldownSeconds: number;
  /**
   * Which visibility layers are active for the resulting game. The host
   * picks this in the lobby UI; the engine snapshots it onto
   * `games.visibility_mode` at start. Locked-knob errors surface as
   * `400 visibility_knob_locked` from the patch endpoint. See TDD
   * §3.2 / §3.3.
   */
  visibilityMode: VisibilityMode;
  teamAssignmentMode: TeamAssignmentMode;
  minPlayersToStart: number;
  /** Station code where all teams spawn at game start (null = no default). */
  defaultStartNodeCode: string | null;
  configUpdatedAt: Date | null;
}

export interface LobbyDetailDto {
  id: string;
  status: LobbyStatus;
  hostUserId: string;
  /**
   * Id of the `games` row spawned from this lobby, once the host has
   * started it. `null` while the lobby is still `waiting`. Surfaced
   * here so the `lobby.config` broadcast that fires when status flips
   * to `closed` also tells every member where to navigate — without
   * this field, non-host clients would receive the status change but
   * have no way to look up the new game.
   */
  gameId: string | null;
  config: LobbyConfigDto;
  members: LobbyMemberDto[];
  readiness: LobbyReadinessDto;
  /**
   * Scheduled notifications attached to the lobby. Ordered by
   * `atSeconds` ascending, then insertion order. Included here so a
   * single `lobby.config` broadcast (chunk 7) carries the entire
   * lobby-visible state — clients don't have to chase a separate
   * `/notifications` request to react to a CRUD push.
   */
  notifications: LobbyNotificationDto[];
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
  hostUsername?: string | null,
): LobbyReadinessDto {
  const reasons: string[] = [];
  const memberCount = members.length;
  const minPlayersToStart = lobby.minPlayersToStart;
  const mode = lobby.teamAssignmentMode;
  const soloStartAllowed = isRelaxLobbyStart(hostUsername);

  if (lobby.status !== "waiting") {
    reasons.push(`Lobby status is "${lobby.status}", not waiting`);
  }

  const assignmentByUser = new Map(
    teamAssignments.map((a) => [a.userId, a.teamSlot]),
  );
  const playersPerTeam = countPlayersPerTeam(members, assignmentByUser);
  const unassignedCount = countUnassigned(members, assignmentByUser);
  const missingTeams = GAME_TEAM_SLOTS.filter(
    (team) => playersPerTeam[String(team)] === 0,
  );

  if (soloStartAllowed) {
    if (memberCount < 1) {
      reasons.push("Need at least 1 player to start");
    }
    return {
      ready: reasons.length === 0,
      reasons,
      memberCount,
      minPlayersToStart,
      soloStartAllowed,
      playersPerTeam,
      missingTeams: [...missingTeams],
      unassignedCount,
    };
  }

  if (memberCount < minPlayersToStart) {
    reasons.push(
      `Need at least ${minPlayersToStart} players (${memberCount} joined)`,
    );
  }

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
    soloStartAllowed,
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
  notifications: LobbyNotificationDto[],
  gameId: string | null,
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
    gameId,
    config: {
      mapTemplateId: lobby.mapTemplateId,
      gameDurationSeconds: lobby.gameDurationSeconds,
      visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
      visibilityPhaseCount: lobby.visibilityPhaseCount,
      slotsPerNode: lobby.slotsPerNode,
      slotUnlockOffsetsSeconds: lobby.slotUnlockOffsetsSeconds,
      slotMapUnlockOffsetsSeconds: lobby.slotMapUnlockOffsetsSeconds,
      deadWallSize: lobby.deadWallSize,
      challengeCooldownSeconds: lobby.challengeCooldownSeconds,
      visibilityMode: lobby.visibilityMode,
      teamAssignmentMode: lobby.teamAssignmentMode,
      minPlayersToStart: lobby.minPlayersToStart,
      defaultStartNodeCode: lobby.defaultStartNodeCode,
      configUpdatedAt: lobby.configUpdatedAt,
    },
    members: memberDtos,
    readiness: computeReadiness(
      lobby,
      members,
      teamAssignments,
      usersById.get(lobby.hostUserId)?.username,
    ),
    notifications,
  };
}
