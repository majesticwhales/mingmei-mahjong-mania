import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Lobby, type TeamAssignmentMode } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import {
  assertStartNodeCodeOnTemplate,
  normalizeStartNodeCode,
} from "./map-template-start-node.ts";
import { User } from "../models/user.ts";
import { GAME_TEAM_SLOTS } from "./even-team-assignment.ts";
import {
  computeReadiness,
  type LobbyDetailDto,
  serializeLobbyDetail,
} from "./lobby-serializer.ts";

const DEFAULT_TEMPLATE_NAME = "TTC 2026";

export interface CreateLobbyOptions {
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  visibilityPhaseCount?: number;
  slotsPerNode?: number;
  /**
   * Per-slot unlock offsets in seconds from game start. Length must equal
   * the final `slotsPerNode`; entry `[0]` must be `0` (slot 0 always
   * unlocked); all entries `>= 0` integers. Defaults to the template's
   * `defaultSlotUnlockOffsetsSeconds`. See TDD §3.3 / §4.1.
   */
  slotUnlockOffsetsSeconds?: number[];
  /**
   * Per-slot map-visibility flags. Length must equal the final
   * `slotsPerNode`; entry `[0]` must be `true` (slot 0 follows phase rules).
   * When `false`, slot k's tile is never face-up on the map regardless of
   * phase. Defaults to the template's `defaultSlotMapVisible`.
   */
  slotMapVisible?: boolean[];
  teamAssignmentMode?: TeamAssignmentMode;
  minPlayersToStart?: number;
  defaultStartNodeCode?: string | null;
}

export interface UpdateLobbyConfigPatch {
  mapTemplateId?: string;
  gameDurationSeconds?: number;
  visibilityPhaseIntervalSeconds?: number;
  visibilityPhaseCount?: number;
  slotsPerNode?: number;
  /** See `CreateLobbyOptions.slotUnlockOffsetsSeconds`. */
  slotUnlockOffsetsSeconds?: number[];
  /** See `CreateLobbyOptions.slotMapVisible`. */
  slotMapVisible?: boolean[];
  teamAssignmentMode?: TeamAssignmentMode;
  minPlayersToStart?: number;
  defaultStartNodeCode?: string | null;
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

/** teamSlot is the game team index (1–4); multiple users may pick the same team. */
function validateTeamSlot(teamSlot: number | null) {
  if (teamSlot === null) {
    return;
  }
  if (!GAME_TEAM_SLOTS.includes(teamSlot as (typeof GAME_TEAM_SLOTS)[number])) {
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

function validatePositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a positive integer`,
    );
  }
}

/**
 * Validate the shape of `slotUnlockOffsetsSeconds` against the resolved
 * `slotsPerNode`. Mirrors the DB CHECK constraint added by the chunk-5
 * migration so the host gets a useful 400 rather than a 500-by-Postgres.
 */
function validateSlotUnlockOffsetsSeconds(
  arr: number[],
  slotsPerNode: number,
): void {
  if (!Array.isArray(arr)) {
    throw new HttpError(
      400,
      "validation_error",
      "slotUnlockOffsetsSeconds must be an array",
    );
  }
  if (arr.length !== slotsPerNode) {
    throw new HttpError(
      400,
      "validation_error",
      `slotUnlockOffsetsSeconds length (${arr.length}) must equal slotsPerNode (${slotsPerNode})`,
    );
  }
  if (arr[0] !== 0) {
    throw new HttpError(
      400,
      "validation_error",
      "slotUnlockOffsetsSeconds[0] must be 0 (slot 0 is always unlocked)",
    );
  }
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i]!;
    if (!Number.isInteger(v) || v < 0) {
      throw new HttpError(
        400,
        "validation_error",
        `slotUnlockOffsetsSeconds[${i}] must be a non-negative integer`,
      );
    }
  }
}

function validateSlotMapVisible(
  arr: boolean[],
  slotsPerNode: number,
): void {
  if (!Array.isArray(arr)) {
    throw new HttpError(
      400,
      "validation_error",
      "slotMapVisible must be an array",
    );
  }
  if (arr.length !== slotsPerNode) {
    throw new HttpError(
      400,
      "validation_error",
      `slotMapVisible length (${arr.length}) must equal slotsPerNode (${slotsPerNode})`,
    );
  }
  if (arr[0] !== true) {
    throw new HttpError(
      400,
      "validation_error",
      "slotMapVisible[0] must be true (slot 0 follows phase rules)",
    );
  }
  for (let i = 0; i < arr.length; i += 1) {
    if (typeof arr[i] !== "boolean") {
      throw new HttpError(
        400,
        "validation_error",
        `slotMapVisible[${i}] must be a boolean`,
      );
    }
  }
}

/**
 * Resize a slot-shaped array to `slotsPerNode`. Used when `slotsPerNode`
 * changes via patch and the host didn't supply replacement arrays — pads
 * with `padValue` (0 for offsets, true for map-visibility) when growing
 * and truncates when shrinking, preserving any host-set entries inside the
 * new bounds. Slot 0 is always kept as `padValue`'s "always-unlocked" /
 * "always-map-visible" semantics by construction (the source array has
 * `[0]` already pinned to the right value, and we never touch index 0
 * during resize).
 */
function resizeSlotArray<T>(source: T[], slotsPerNode: number, padValue: T): T[] {
  if (source.length === slotsPerNode) return source.slice();
  if (source.length > slotsPerNode) return source.slice(0, slotsPerNode);
  return [...source, ...new Array<T>(slotsPerNode - source.length).fill(padValue)];
}

export async function createLobby(
  hostUserId: string,
  options: CreateLobbyOptions = {},
): Promise<LobbyDetailDto> {
  const template = await resolveMapTemplate(options.mapTemplateId);
  const gameDurationSeconds =
    options.gameDurationSeconds ?? template.defaultDurationSeconds;
  const visibilityPhaseCount =
    options.visibilityPhaseCount ?? template.defaultVisibilityPhaseCount;
  const visibilityPhaseIntervalSeconds =
    options.visibilityPhaseIntervalSeconds ??
    Math.floor(gameDurationSeconds / Math.max(visibilityPhaseCount, 1));
  const slotsPerNode = options.slotsPerNode ?? template.defaultSlotsPerNode;
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
  validatePositiveInt(visibilityPhaseCount, "visibilityPhaseCount");
  validatePositiveInt(slotsPerNode, "slotsPerNode");
  if (minPlayersToStart < 4) {
    throw new HttpError(
      400,
      "validation_error",
      "minPlayersToStart must be at least 4 (one player per team minimum)",
    );
  }

  // Per-slot rules arrays default to the template's defaults. The host can
  // override either independently, but the resulting length must match
  // `slotsPerNode` (we don't silently resize on create — they asked for
  // these specific arrays).
  const slotUnlockOffsetsSeconds =
    options.slotUnlockOffsetsSeconds ??
    template.defaultSlotUnlockOffsetsSeconds;
  const slotMapVisible =
    options.slotMapVisible ?? template.defaultSlotMapVisible;
  validateSlotUnlockOffsetsSeconds(slotUnlockOffsetsSeconds, slotsPerNode);
  validateSlotMapVisible(slotMapVisible, slotsPerNode);

  let defaultStartNodeCode =
    options.defaultStartNodeCode !== undefined
      ? options.defaultStartNodeCode
      : template.defaultStartNodeCode;
  if (defaultStartNodeCode != null) {
    defaultStartNodeCode = normalizeStartNodeCode(defaultStartNodeCode);
    await assertStartNodeCodeOnTemplate(template.id, defaultStartNodeCode);
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
        visibilityPhaseCount,
        slotsPerNode,
        slotUnlockOffsetsSeconds,
        slotMapVisible,
        teamAssignmentMode,
        minPlayersToStart,
        defaultStartNodeCode,
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

/** Set or change the member's team (1–4), or null for the random pool. Re-picking replaces a prior choice. */
export async function pickTeam(
  lobbyId: string,
  userId: string,
  teamSlot: number | null,
): Promise<LobbyDetailDto> {
  validateTeamSlot(teamSlot);

  const { lobby, members, teamAssignments } = await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);
  assertIsMember(members, userId);

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
    const template = await resolveMapTemplate(patch.mapTemplateId);
    lobby.mapTemplateId = template.id;
    if (patch.defaultStartNodeCode === undefined) {
      lobby.defaultStartNodeCode = template.defaultStartNodeCode;
    }
    if (patch.slotsPerNode == null) {
      lobby.slotsPerNode = template.defaultSlotsPerNode;
    }
    if (patch.visibilityPhaseCount == null) {
      lobby.visibilityPhaseCount = template.defaultVisibilityPhaseCount;
    }
    // When the host swaps to a new template without explicitly setting the
    // per-slot arrays, inherit the new template's defaults — mirrors the
    // slotsPerNode / visibilityPhaseCount behavior above.
    if (patch.slotUnlockOffsetsSeconds == null) {
      lobby.slotUnlockOffsetsSeconds = template.defaultSlotUnlockOffsetsSeconds;
    }
    if (patch.slotMapVisible == null) {
      lobby.slotMapVisible = template.defaultSlotMapVisible;
    }
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
  if (patch.visibilityPhaseCount != null) {
    validatePositiveInt(patch.visibilityPhaseCount, "visibilityPhaseCount");
    lobby.visibilityPhaseCount = patch.visibilityPhaseCount;
  }
  if (patch.slotsPerNode != null) {
    validatePositiveInt(patch.slotsPerNode, "slotsPerNode");
    lobby.slotsPerNode = patch.slotsPerNode;
  }
  // Per-slot arrays: explicit patch values override template inheritance.
  // If the host changes `slotsPerNode` alone, we auto-resize the existing
  // arrays (pad with 0 / true; truncate when shrinking) to stay aligned
  // with the new cardinality. The DB CHECK constraint added by the
  // chunk-5 migration also enforces this length match — these app-level
  // checks just produce nicer error messages.
  if (patch.slotUnlockOffsetsSeconds != null) {
    lobby.slotUnlockOffsetsSeconds = patch.slotUnlockOffsetsSeconds;
  } else if (lobby.slotUnlockOffsetsSeconds.length !== lobby.slotsPerNode) {
    lobby.slotUnlockOffsetsSeconds = resizeSlotArray(
      lobby.slotUnlockOffsetsSeconds,
      lobby.slotsPerNode,
      0,
    );
  }
  if (patch.slotMapVisible != null) {
    lobby.slotMapVisible = patch.slotMapVisible;
  } else if (lobby.slotMapVisible.length !== lobby.slotsPerNode) {
    lobby.slotMapVisible = resizeSlotArray(
      lobby.slotMapVisible,
      lobby.slotsPerNode,
      true,
    );
  }
  validateSlotUnlockOffsetsSeconds(
    lobby.slotUnlockOffsetsSeconds,
    lobby.slotsPerNode,
  );
  validateSlotMapVisible(lobby.slotMapVisible, lobby.slotsPerNode);
  if (patch.teamAssignmentMode != null) {
    validateTeamAssignmentMode(patch.teamAssignmentMode);
    lobby.teamAssignmentMode = patch.teamAssignmentMode;
  }
  if (patch.minPlayersToStart != null) {
    if (patch.minPlayersToStart < 4) {
      throw new HttpError(
        400,
        "validation_error",
        "minPlayersToStart must be at least 4 (one player per team minimum)",
      );
    }
    lobby.minPlayersToStart = patch.minPlayersToStart;
  }
  if (patch.defaultStartNodeCode !== undefined) {
    if (patch.defaultStartNodeCode === null) {
      lobby.defaultStartNodeCode = null;
    } else {
      const code = normalizeStartNodeCode(patch.defaultStartNodeCode);
      await assertStartNodeCodeOnTemplate(lobby.mapTemplateId, code);
      lobby.defaultStartNodeCode = code;
    }
  }

  lobby.configUpdatedAt = new Date();
  await lobby.save();

  return getLobbyForUser(lobbyId, hostUserId);
}

export async function getStartReadiness(lobbyId: string) {
  const { lobby, members, teamAssignments } = await loadLobbyBundle(lobbyId);
  return computeReadiness(lobby, members, teamAssignments);
}
