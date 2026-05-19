import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Lobby, type TeamAssignmentMode } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { User } from "../models/user.ts";
import {
  computeReadiness,
  type LobbyDetailDto,
  serializeLobbyDetail,
} from "./lobby-serializer.ts";

const DEFAULT_TEMPLATE_NAME = "TTC 2026";
const TEAM_SLOTS = [1, 2, 3, 4] as const;

export interface CreateLobbyOptions {
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  teamAssignmentMode?: TeamAssignmentMode;
  minPlayersToStart?: number;
}

export interface UpdateLobbyConfigPatch {
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  teamAssignmentMode?: TeamAssignmentMode;
  minPlayersToStart?: number;
}

async function resolveMapTemplate(mapTemplateId?: string): Promise<MapTemplate> {
  if (mapTemplateId) {
    const template = await MapTemplate.findByPk(mapTemplateId);
    if (!template) {
      throw new HttpError(404, "not_found", "Map template not found");
    }
    return template;
  }
  const template = await MapTemplate.findOne({
    where: { name: DEFAULT_TEMPLATE_NAME },
  });
  if (!template) {
    throw new HttpError(
      404,
      "not_found",
      `Default map template "${DEFAULT_TEMPLATE_NAME}" not found. Run db:seed.`,
    );
  }
  return template;
}

async function loadLobbyBundle(lobbyId: string) {
  const lobby = await Lobby.findByPk(lobbyId);
  if (!lobby) {
    throw new HttpError(404, "not_found", "Lobby not found");
  }
  const [members, teamAssignments] = await Promise.all([
    LobbyMember.findAll({ where: { lobbyId } }),
    LobbyTeamAssignment.findAll({ where: { lobbyId } }),
  ]);
  const userIds = [...new Set(members.map((m) => m.userId))];
  const users = await User.findAll({ where: { id: userIds } });
  const usersById = new Map(users.map((u) => [u.id, u]));
  return { lobby, members, teamAssignments, usersById };
}

function assertLobbyWaiting(lobby: Lobby) {
  if (lobby.status !== "waiting") {
    throw new HttpError(
      409,
      "lobby_not_waiting",
      `Lobby is not accepting changes (status: ${lobby.status})`,
    );
  }
}

function assertIsMember(members: LobbyMember[], userId: string) {
  if (!members.some((m) => m.userId === userId)) {
    throw new HttpError(403, "forbidden", "You are not a member of this lobby");
  }
}

function assertIsHost(lobby: Lobby, userId: string) {
  if (lobby.hostUserId !== userId) {
    throw new HttpError(403, "forbidden", "Only the host can perform this action");
  }
}

function validateTeamSlot(teamSlot: number | null) {
  if (teamSlot === null) {
    return;
  }
  if (!TEAM_SLOTS.includes(teamSlot as (typeof TEAM_SLOTS)[number])) {
    throw new HttpError(
      400,
      "validation_error",
      "teamSlot must be 1, 2, 3, 4, or null",
    );
  }
}

function validateTeamAssignmentMode(mode: string): asserts mode is TeamAssignmentMode {
  if (!["pick", "random", "mixed"].includes(mode)) {
    throw new HttpError(
      400,
      "validation_error",
      "teamAssignmentMode must be pick, random, or mixed",
    );
  }
}

export async function createLobby(
  hostUserId: string,
  options: CreateLobbyOptions = {},
): Promise<LobbyDetailDto> {
  const template = await resolveMapTemplate(options.mapTemplateId);
  const gameDurationSeconds =
    options.gameDurationSeconds ?? template.defaultDurationSeconds;
  const visibilityPhaseIntervalSeconds =
    options.visibilityPhaseIntervalSeconds ??
    Math.floor(gameDurationSeconds / 4);
  const teamAssignmentMode = options.teamAssignmentMode ?? "pick";
  const minPlayersToStart = options.minPlayersToStart ?? 4;

  validateTeamAssignmentMode(teamAssignmentMode);
  if (gameDurationSeconds < 60) {
    throw new HttpError(
      400,
      "validation_error",
      "gameDurationSeconds must be at least 60",
    );
  }
  if (visibilityPhaseIntervalSeconds < 1) {
    throw new HttpError(
      400,
      "validation_error",
      "visibilityPhaseIntervalSeconds must be positive",
    );
  }
  if (minPlayersToStart < 2 || minPlayersToStart > 4) {
    throw new HttpError(
      400,
      "validation_error",
      "minPlayersToStart must be between 2 and 4",
    );
  }

  const now = new Date();

  return sequelize.transaction(async (transaction) => {
    const lobby = await Lobby.create(
      {
        hostUserId,
        status: "waiting",
        mapTemplateId: template.id,
        gameDurationSeconds,
        visibilityPhaseIntervalSeconds,
        teamAssignmentMode,
        minPlayersToStart,
        configUpdatedAt: now,
      },
      { transaction },
    );

    await LobbyMember.create(
      {
        lobbyId: lobby.id,
        userId: hostUserId,
        joinedAt: now,
      },
      { transaction },
    );

    await LobbyTeamAssignment.create(
      {
        lobbyId: lobby.id,
        userId: hostUserId,
        teamSlot: null,
      },
      { transaction },
    );

    const members = await LobbyMember.findAll({
      where: { lobbyId: lobby.id },
      transaction,
    });
    const teamAssignments = await LobbyTeamAssignment.findAll({
      where: { lobbyId: lobby.id },
      transaction,
    });
    const host = await User.findByPk(hostUserId, { transaction });
    const usersById = new Map(host ? [[host.id, host]] : []);

    return serializeLobbyDetail(
      lobby,
      members,
      teamAssignments,
      usersById,
    );
  });
}

export async function getLobbyForUser(
  lobbyId: string,
  userId: string,
): Promise<LobbyDetailDto> {
  const { lobby, members, teamAssignments, usersById } =
    await loadLobbyBundle(lobbyId);
  assertIsMember(members, userId);
  return serializeLobbyDetail(lobby, members, teamAssignments, usersById);
}

export async function joinLobby(
  lobbyId: string,
  userId: string,
): Promise<LobbyDetailDto> {
  const { lobby, members, teamAssignments, usersById } =
    await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);

  if (members.some((m) => m.userId === userId)) {
    return serializeLobbyDetail(lobby, members, teamAssignments, usersById);
  }

  const now = new Date();

  await sequelize.transaction(async (transaction) => {
    await LobbyMember.create(
      { lobbyId, userId, joinedAt: now },
      { transaction },
    );
    await LobbyTeamAssignment.create(
      { lobbyId, userId, teamSlot: null },
      { transaction },
    );
  });

  return getLobbyForUser(lobbyId, userId);
}

export async function pickTeam(
  lobbyId: string,
  userId: string,
  teamSlot: number | null,
): Promise<LobbyDetailDto> {
  validateTeamSlot(teamSlot);

  const { lobby, members, teamAssignments } = await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);
  assertIsMember(members, userId);

  if (teamSlot != null) {
    const taken = teamAssignments.find(
      (a) => a.userId !== userId && a.teamSlot === teamSlot,
    );
    if (taken) {
      throw new HttpError(409, "team_slot_taken", `Team slot ${teamSlot} is taken`);
    }
  }

  const assignment = teamAssignments.find((a) => a.userId === userId);
  if (!assignment) {
    throw new HttpError(500, "internal_error", "Missing team assignment row");
  }

  assignment.teamSlot = teamSlot;
  await assignment.save();

  return getLobbyForUser(lobbyId, userId);
}

export async function updateConfig(
  lobbyId: string,
  hostUserId: string,
  patch: UpdateLobbyConfigPatch,
): Promise<LobbyDetailDto> {
  const { lobby } = await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);
  assertIsHost(lobby, hostUserId);

  if (patch.mapTemplateId != null) {
    await resolveMapTemplate(patch.mapTemplateId);
    lobby.mapTemplateId = patch.mapTemplateId;
  }
  if (patch.gameDurationSeconds != null) {
    if (patch.gameDurationSeconds < 60) {
      throw new HttpError(
        400,
        "validation_error",
        "gameDurationSeconds must be at least 60",
      );
    }
    lobby.gameDurationSeconds = patch.gameDurationSeconds;
  }
  if (patch.visibilityPhaseIntervalSeconds != null) {
    if (patch.visibilityPhaseIntervalSeconds < 1) {
      throw new HttpError(
        400,
        "validation_error",
        "visibilityPhaseIntervalSeconds must be positive",
      );
    }
    lobby.visibilityPhaseIntervalSeconds = patch.visibilityPhaseIntervalSeconds;
  }
  if (patch.teamAssignmentMode != null) {
    validateTeamAssignmentMode(patch.teamAssignmentMode);
    lobby.teamAssignmentMode = patch.teamAssignmentMode;
  }
  if (patch.minPlayersToStart != null) {
    if (patch.minPlayersToStart < 2 || patch.minPlayersToStart > 4) {
      throw new HttpError(
        400,
        "validation_error",
        "minPlayersToStart must be between 2 and 4",
      );
    }
    lobby.minPlayersToStart = patch.minPlayersToStart;
  }

  lobby.configUpdatedAt = new Date();
  await lobby.save();

  return getLobbyForUser(lobbyId, hostUserId);
}

export async function getStartReadiness(lobbyId: string) {
  const { lobby, members, teamAssignments } = await loadLobbyBundle(lobbyId);
  return computeReadiness(lobby, members, teamAssignments);
}
