import { assertIsAdmin } from "./auth-service.ts";
import { sequelize } from "../config/database.ts";
import {
  isVisibilityMode,
  visibilityIncludes,
  type VisibilityMode,
} from "../game/visibility-mode.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { Lobby, type TeamAssignmentMode } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyNotification } from "../models/lobby-notification.ts";
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
import { serializeLobbyNotification } from "./lobby-notification-service.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";
import {
  lobbyPresetForTestFlag,
} from "../game/lobby-presets.ts";

const DEFAULT_TEMPLATE_NAME = "TTC 2026";

export interface CreateLobbyOptions {
  /** When true, use the short 240s test preset instead of the 4-hour production preset. */
  isTestGame?: boolean;
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
   * Per-slot map-reveal offsets in seconds from game start (Phase L
   * §3.13). Length must equal the final `slotsPerNode`; entry `[0]` must
   * be `0` (slot 0 always immediately on-map). Each entry is either a
   * non-negative integer `>= slotUnlockOffsetsSeconds[k]` (map reveal at
   * that offset) or `null` (slot is never on the map regardless of
   * timer — the "out of play on map" tier). Defaults to the template's
   * `defaultSlotMapUnlockOffsetsSeconds`. See TDD §3.3 / §3.13.
   */
  slotMapUnlockOffsetsSeconds?: Array<number | null>;
  /**
   * Size of the per-game dead wall, snapshotted to `games.dead_wall_size`
   * at start. Non-negative integer; defaults to the template's
   * `defaultDeadWallSize`. The dealer's closed-set invariant
   * (`slotsPerNode × nodeCount + handSize × teamCount + deadWallSize ===
   * catalogSize`) is checked at game start, not on lobby create, so a
   * bad value here surfaces as a 500 from `startFromLobby` rather than
   * a 400 here. See TDD §3.9.
   */
  deadWallSize?: number;
  /**
   * Which visibility layers are active for the resulting game
   * (`none | phase | slot | both`). Sourced from
   * `mapTemplate.defaultVisibilityMode` when omitted. Picking a mode
   * that excludes the phase layer locks `visibilityPhaseCount` /
   * `visibilityPhaseIntervalSeconds`; picking one that excludes the
   * slot layer locks non-zero `slotUnlockOffsetsSeconds[k>0]` and any
   * non-zero / null entry in `slotMapUnlockOffsetsSeconds[k>0]`. See
   * TDD §3.2 / §3.3 and `server/src/game/visibility-mode.ts`.
   */
  visibilityMode?: VisibilityMode;
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
  /** See `CreateLobbyOptions.slotMapUnlockOffsetsSeconds`. */
  slotMapUnlockOffsetsSeconds?: Array<number | null>;
  /** See `CreateLobbyOptions.deadWallSize`. */
  deadWallSize?: number;
  /** See `CreateLobbyOptions.visibilityMode`. */
  visibilityMode?: VisibilityMode;
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
  const [members, teamAssignments, notificationRows, game] = await Promise.all([
    LobbyMember.findAll({ where: { lobbyId } }),
    LobbyTeamAssignment.findAll({ where: { lobbyId } }),
    LobbyNotification.findAll({
      where: { lobbyId },
      order: [
        ["atSeconds", "ASC"],
        ["createdAt", "ASC"],
      ],
    }),
    Game.findOne({ where: { lobbyId }, attributes: ["id"] }),
  ]);
  const userIds = [...new Set(members.map((m) => m.userId))];
  const users = await User.findAll({ where: { id: userIds } });
  const usersById = new Map(users.map((u) => [u.id, u]));
  const notifications = notificationRows.map(serializeLobbyNotification);
  const gameId = game?.id ?? null;
  return { lobby, members, teamAssignments, usersById, notifications, gameId };
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

function validateVisibilityMode(value: unknown): asserts value is VisibilityMode {
  if (!isVisibilityMode(value)) {
    throw new HttpError(
      400,
      "validation_error",
      "visibilityMode must be one of: none, phase, slot, both",
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

function validateNonNegativeInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-negative integer`,
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

/**
 * Validate the Phase L map-reveal offsets array (`slot_map_unlock_offsets_seconds`).
 * Mirrors the DB CHECK constraints from `20260611120000-add-slot-map-unlock-offsets.cjs`
 * so the host gets a useful 400 rather than a Postgres 500. The
 * `claimOffsets` argument is the resolved `slotUnlockOffsetsSeconds` for
 * the same lobby/config so we can enforce the per-element
 * `mapOffset[i] IS NULL OR mapOffset[i] >= claimOffset[i]` rule
 * (the CHECK on the row itself can't see across columns from JS land).
 */
function validateSlotMapUnlockOffsetsSeconds(
  arr: Array<number | null>,
  slotsPerNode: number,
  claimOffsets: number[],
): void {
  if (!Array.isArray(arr)) {
    throw new HttpError(
      400,
      "validation_error",
      "slotMapUnlockOffsetsSeconds must be an array",
    );
  }
  if (arr.length !== slotsPerNode) {
    throw new HttpError(
      400,
      "validation_error",
      `slotMapUnlockOffsetsSeconds length (${arr.length}) must equal slotsPerNode (${slotsPerNode})`,
    );
  }
  if (arr[0] !== 0) {
    throw new HttpError(
      400,
      "validation_error",
      "slotMapUnlockOffsetsSeconds[0] must be 0 (slot 0 is always immediately on the map)",
    );
  }
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v === null) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new HttpError(
        400,
        "validation_error",
        `slotMapUnlockOffsetsSeconds[${i}] must be a non-negative integer or null`,
      );
    }
    const claim = claimOffsets[i];
    if (claim != null && v < claim) {
      throw new HttpError(
        400,
        "validation_error",
        `slotMapUnlockOffsetsSeconds[${i}] (${v}) must be >= slotUnlockOffsetsSeconds[${i}] (${claim}) — map reveal cannot precede claim reveal`,
      );
    }
  }
}

/**
 * Resize a slot-shaped array to `slotsPerNode`. Used when `slotsPerNode`
 * changes via patch and the host didn't supply replacement arrays — pads
 * with `padValue` when growing and truncates when shrinking. Slot 0 is
 * always kept as the source's `[0]` (which is itself pinned to the
 * always-on-map / always-claimable invariant).
 *
 * The pad value depends on the column: `0` for claim offsets, `0` for
 * map offsets (mirrors the always-immediately-on-map semantics of slot 0
 * — extending into newly-added slots with `0` is a safe no-op since map
 * reveal at t=0 also satisfies the `map[k] >= claim[k]` CHECK whenever
 * claim is at most 0).
 */
function resizeSlotArray<T>(source: T[], slotsPerNode: number, padValue: T): T[] {
  if (source.length === slotsPerNode) return source.slice();
  if (source.length > slotsPerNode) return source.slice(0, slotsPerNode);
  return [...source, ...new Array<T>(slotsPerNode - source.length).fill(padValue)];
}

/**
 * Per-mode knob lock. When the effective `visibilityMode` excludes a
 * layer, the host cannot send patches that would meaningfully configure
 * that layer — those knobs are dead weight and pretending to set them
 * just leads to confusion (the engine ignores the values entirely).
 *
 * - `phase` off  -> reject any `visibilityPhaseCount` /
 *                   `visibilityPhaseIntervalSeconds` in the patch.
 * - `slot`  off  -> reject `slotUnlockOffsetsSeconds[k>0]` non-zero,
 *                   `slotMapUnlockOffsetsSeconds[k>0]` non-zero, or
 *                   `slotMapUnlockOffsetsSeconds[k>0]` null. Setting
 *                   either array to its trivial value (all-zero, no
 *                   nulls) is still fine because that's a no-op.
 *
 * The check runs after array length validation so the `k>0` indexing
 * is guaranteed safe. Returns nothing; throws on the first violation.
 */
function assertPatchObeysVisibilityLock(
  mode: VisibilityMode,
  patch: {
    visibilityPhaseCount?: number;
    visibilityPhaseIntervalSeconds?: number;
    slotUnlockOffsetsSeconds?: number[];
    slotMapUnlockOffsetsSeconds?: Array<number | null>;
  },
): void {
  if (!visibilityIncludes(mode, "phase")) {
    if (patch.visibilityPhaseCount !== undefined) {
      throw new HttpError(
        400,
        "visibility_knob_locked",
        `visibilityPhaseCount cannot be set when visibilityMode is "${mode}" (phase layer disabled)`,
      );
    }
    if (patch.visibilityPhaseIntervalSeconds !== undefined) {
      throw new HttpError(
        400,
        "visibility_knob_locked",
        `visibilityPhaseIntervalSeconds cannot be set when visibilityMode is "${mode}" (phase layer disabled)`,
      );
    }
  }
  if (!visibilityIncludes(mode, "slot")) {
    const offsets = patch.slotUnlockOffsetsSeconds;
    if (offsets !== undefined) {
      for (let i = 1; i < offsets.length; i += 1) {
        if (offsets[i] !== 0) {
          throw new HttpError(
            400,
            "visibility_knob_locked",
            `slotUnlockOffsetsSeconds[${i}] must be 0 when visibilityMode is "${mode}" (slot layer disabled)`,
          );
        }
      }
    }
    const mapOffsets = patch.slotMapUnlockOffsetsSeconds;
    if (mapOffsets !== undefined) {
      for (let i = 1; i < mapOffsets.length; i += 1) {
        const v = mapOffsets[i];
        if (v === null) {
          throw new HttpError(
            400,
            "visibility_knob_locked",
            `slotMapUnlockOffsetsSeconds[${i}] cannot be null when visibilityMode is "${mode}" (slot layer disabled; "never on map" only meaningful with slot tier active)`,
          );
        }
        if (v !== 0) {
          throw new HttpError(
            400,
            "visibility_knob_locked",
            `slotMapUnlockOffsetsSeconds[${i}] must be 0 when visibilityMode is "${mode}" (slot layer disabled)`,
          );
        }
      }
    }
  }
}

/**
 * Coerce slot-layer arrays to their trivial values (everything unlocked
 * at t=0, every slot immediately on-map). Called by `updateConfig` when
 * the host transitions the lobby into a mode that excludes the slot
 * layer: leftover non-zero offsets / null map entries would be silently
 * ignored by the engine but visible in the DTO, which is worse than
 * just zeroing them.
 */
function resetSlotKnobsToTrivial(slotsPerNode: number): {
  offsets: number[];
  mapOffsets: Array<number | null>;
} {
  return {
    offsets: new Array<number>(slotsPerNode).fill(0),
    mapOffsets: new Array<number | null>(slotsPerNode).fill(0),
  };
}

export async function createLobby(
  hostUserId: string,
  options: CreateLobbyOptions = {},
): Promise<LobbyDetailDto> {
  await assertIsAdmin(hostUserId);

  const preset = lobbyPresetForTestFlag(options.isTestGame === true);
  const template = await resolveMapTemplate(options.mapTemplateId);
  const gameDurationSeconds =
    options.gameDurationSeconds ?? preset.gameDurationSeconds;
  const visibilityPhaseCount =
    options.visibilityPhaseCount ?? preset.visibilityPhaseCount;
  const visibilityPhaseIntervalSeconds =
    options.visibilityPhaseIntervalSeconds ??
    preset.visibilityPhaseIntervalSeconds;
  const slotsPerNode = options.slotsPerNode ?? template.defaultSlotsPerNode;
  const deadWallSize = options.deadWallSize ?? template.defaultDeadWallSize;
  const visibilityMode = options.visibilityMode ?? preset.visibilityMode;
  const teamAssignmentMode = options.teamAssignmentMode ?? "pick";
  const minPlayersToStart = options.minPlayersToStart ?? 4;

  validateVisibilityMode(visibilityMode);
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
  validateNonNegativeInt(deadWallSize, "deadWallSize");
  if (minPlayersToStart < 4) {
    throw new HttpError(
      400,
      "validation_error",
      "minPlayersToStart must be at least 4 (one player per team minimum)",
    );
  }

  // Per-slot rules arrays. Resolution order:
  //   1. Explicit host override → use as-is (must match slotsPerNode or
  //      validation throws).
  //   2. Template default whose length matches `slotsPerNode` → inherit.
  //   3. Algorithmic default — `[0,0,...,0]` for offsets, `[true,...,true]`
  //      for map-visibility. Triggered when the host overrides
  //      `slotsPerNode` past the template's defaults' length, so they
  //      don't have to also re-supply matched-length arrays just to start
  //      a lobby. Mirrors the auto-resize behavior in `updateConfig`.
  const slotUnlockOffsetsSeconds = options.slotUnlockOffsetsSeconds
    ?? (template.defaultSlotUnlockOffsetsSeconds.length === slotsPerNode
      ? template.defaultSlotUnlockOffsetsSeconds
      : (new Array<number>(slotsPerNode).fill(0)));
  const slotMapUnlockOffsetsSeconds = options.slotMapUnlockOffsetsSeconds
    ?? (template.defaultSlotMapUnlockOffsetsSeconds.length === slotsPerNode
      ? template.defaultSlotMapUnlockOffsetsSeconds
      : (new Array<number | null>(slotsPerNode).fill(0)));
  validateSlotUnlockOffsetsSeconds(slotUnlockOffsetsSeconds, slotsPerNode);
  validateSlotMapUnlockOffsetsSeconds(
    slotMapUnlockOffsetsSeconds,
    slotsPerNode,
    slotUnlockOffsetsSeconds,
  );

  // Enforce the per-mode knob lock against whatever the host actually
  // supplied (template-derived defaults are exempt by construction —
  // the host didn't ask for those values, so silently allowing them
  // keeps create paths that omit the slot arrays working).
  assertPatchObeysVisibilityLock(visibilityMode, {
    visibilityPhaseCount: options.visibilityPhaseCount,
    visibilityPhaseIntervalSeconds: options.visibilityPhaseIntervalSeconds,
    slotUnlockOffsetsSeconds: options.slotUnlockOffsetsSeconds,
    slotMapUnlockOffsetsSeconds: options.slotMapUnlockOffsetsSeconds,
  });

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
        slotMapUnlockOffsetsSeconds,
        deadWallSize,
        visibilityMode,
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

    const notificationRows = await LobbyNotification.bulkCreate(
      preset.notifications.map((notification) => ({
        lobbyId: lobby.id,
        atSeconds: notification.atSeconds,
        template: notification.template,
        data: notification.data,
      })),
      { transaction, returning: true },
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
    const notifications = notificationRows.map(serializeLobbyNotification);

    return serializeLobbyDetail(
      lobby,
      members,
      teamAssignments,
      usersById,
      notifications,
      null,
    );
  });
}

export async function getLobbyForUser(
  lobbyId: string,
  userId: string,
): Promise<LobbyDetailDto> {
  const { lobby, members, teamAssignments, usersById, notifications, gameId } =
    await loadLobbyBundle(lobbyId);
  assertIsMember(members, userId);
  return serializeLobbyDetail(
    lobby,
    members,
    teamAssignments,
    usersById,
    notifications,
    gameId,
  );
}

/**
 * Build a lobby detail DTO without the membership check.
 *
 * Used by the realtime broadcaster (`emitLobbyConfig`) when fanning the
 * latest lobby state out to everyone in `lobby:{lobbyId}`. Membership
 * is enforced *at join time* via `lobby.join` (chunk 3), so anyone who
 * is in the room is by definition allowed to see the DTO — re-running
 * `assertIsMember` per recipient here would only add round-trips
 * without strengthening the security model.
 */
export async function getLobbyDetail(
  lobbyId: string,
): Promise<LobbyDetailDto> {
  const { lobby, members, teamAssignments, usersById, notifications, gameId } =
    await loadLobbyBundle(lobbyId);
  return serializeLobbyDetail(
    lobby,
    members,
    teamAssignments,
    usersById,
    notifications,
    gameId,
  );
}

export async function joinLobby(
  lobbyId: string,
  userId: string,
): Promise<LobbyDetailDto> {
  const { lobby, members, teamAssignments, usersById, notifications, gameId } =
    await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);

  if (members.some((m) => m.userId === userId)) {
    // Idempotent: a repeat join just hands the caller the current DTO
    // without mutating anything, so we deliberately skip the broadcast
    // — connected clients already have this state.
    return serializeLobbyDetail(
      lobby,
      members,
      teamAssignments,
      usersById,
      notifications,
      gameId,
    );
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

  const dto = await getLobbyForUser(lobbyId, userId);
  await getBroadcaster().emitLobbyConfig(lobbyId);
  return dto;
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

  const dto = await getLobbyForUser(lobbyId, userId);
  await getBroadcaster().emitLobbyConfig(lobbyId);
  return dto;
}

export async function updateConfig(
  lobbyId: string,
  hostUserId: string,
  patch: UpdateLobbyConfigPatch,
): Promise<LobbyDetailDto> {
  const { lobby } = await loadLobbyBundle(lobbyId);
  assertLobbyWaiting(lobby);
  assertIsHost(lobby, hostUserId);

  // Snapshot the mode before applying patch fields so the lock check
  // and the "did the mode actually transition?" reset both see the
  // correct effective mode (post-patch if the host sent one, else
  // the lobby's current value).
  const previousVisibilityMode = lobby.visibilityMode;

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
    if (patch.slotMapUnlockOffsetsSeconds == null) {
      lobby.slotMapUnlockOffsetsSeconds =
        template.defaultSlotMapUnlockOffsetsSeconds;
    }
    if (patch.deadWallSize == null) {
      lobby.deadWallSize = template.defaultDeadWallSize;
    }
    if (patch.visibilityMode == null) {
      lobby.visibilityMode = template.defaultVisibilityMode;
    }
  }

  if (patch.visibilityMode != null) {
    validateVisibilityMode(patch.visibilityMode);
    lobby.visibilityMode = patch.visibilityMode;
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
  if (patch.slotMapUnlockOffsetsSeconds != null) {
    lobby.slotMapUnlockOffsetsSeconds = patch.slotMapUnlockOffsetsSeconds;
  } else if (lobby.slotMapUnlockOffsetsSeconds.length !== lobby.slotsPerNode) {
    lobby.slotMapUnlockOffsetsSeconds = resizeSlotArray<number | null>(
      lobby.slotMapUnlockOffsetsSeconds,
      lobby.slotsPerNode,
      0,
    );
  }
  validateSlotUnlockOffsetsSeconds(
    lobby.slotUnlockOffsetsSeconds,
    lobby.slotsPerNode,
  );
  validateSlotMapUnlockOffsetsSeconds(
    lobby.slotMapUnlockOffsetsSeconds,
    lobby.slotsPerNode,
    lobby.slotUnlockOffsetsSeconds,
  );

  // Visibility-mode lock: applied here (post array-resize, post
  // slotsPerNode validation) so the lock check sees the host's *new*
  // arrays and the effective `slotsPerNode`. The lock only rejects
  // explicit patch fields; the auto-resize path is exempt by design
  // (auto-padding to zeros is a no-op for slot-off games).
  assertPatchObeysVisibilityLock(lobby.visibilityMode, {
    visibilityPhaseCount: patch.visibilityPhaseCount,
    visibilityPhaseIntervalSeconds: patch.visibilityPhaseIntervalSeconds,
    slotUnlockOffsetsSeconds: patch.slotUnlockOffsetsSeconds,
    slotMapUnlockOffsetsSeconds: patch.slotMapUnlockOffsetsSeconds,
  });

  // Mode transition cleanup: if the host just turned off a layer, force
  // the locked knobs to their trivial values. The engine doesn't read
  // them when the layer is off, so leaving stale values around would
  // only confuse the DTO consumer (e.g. an FE that still shows
  // "slot 2 unlocks at 5:00" for a phase-only game).
  if (lobby.visibilityMode !== previousVisibilityMode) {
    if (!visibilityIncludes(lobby.visibilityMode, "phase")) {
      if (patch.visibilityPhaseCount == null) {
        const template = await resolveMapTemplate(lobby.mapTemplateId);
        lobby.visibilityPhaseCount = template.defaultVisibilityPhaseCount;
      }
      if (patch.visibilityPhaseIntervalSeconds == null) {
        // Derive from current duration / phase count, matching the
        // create-time fallback. Keeps the column populated with a
        // sensible value even though no engine code reads it.
        lobby.visibilityPhaseIntervalSeconds = Math.max(
          1,
          Math.floor(
            lobby.gameDurationSeconds / Math.max(lobby.visibilityPhaseCount, 1),
          ),
        );
      }
    }
    if (!visibilityIncludes(lobby.visibilityMode, "slot")) {
      const trivial = resetSlotKnobsToTrivial(lobby.slotsPerNode);
      if (patch.slotUnlockOffsetsSeconds == null) {
        lobby.slotUnlockOffsetsSeconds = trivial.offsets;
      }
      if (patch.slotMapUnlockOffsetsSeconds == null) {
        lobby.slotMapUnlockOffsetsSeconds = trivial.mapOffsets;
      }
    }
  }

  if (patch.deadWallSize != null) {
    validateNonNegativeInt(patch.deadWallSize, "deadWallSize");
    lobby.deadWallSize = patch.deadWallSize;
  }
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

  const dto = await getLobbyForUser(lobbyId, hostUserId);
  await getBroadcaster().emitLobbyConfig(lobbyId);
  return dto;
}

export async function getStartReadiness(lobbyId: string) {
  const { lobby, members, teamAssignments, usersById } =
    await loadLobbyBundle(lobbyId);
  return computeReadiness(
    lobby,
    members,
    teamAssignments,
    usersById.get(lobby.hostUserId)?.username,
  );
}
