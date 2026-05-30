import { QueryTypes, type Transaction } from "sequelize";
import { GAME_TEAM_SLOTS, type GameTeamSlot } from "../../src/services/even-team-assignment.ts";
import { cloneMapTemplateToGame } from "../../src/services/map-clone-service.ts";
import { startFromLobby } from "../../src/services/game-start-service.ts";
import { Game } from "../../src/models/game.ts";
import { GameNode } from "../../src/models/game-node.ts";
import { GameParticipant } from "../../src/models/game-participant.ts";
import { GameTeam } from "../../src/models/game-team.ts";
import { GameTeamPosition } from "../../src/models/game-team-position.ts";
import { GameTile } from "../../src/models/game-tile.ts";
import { GameTilePlacement } from "../../src/models/game-tile-placement.ts";
import { Lobby } from "../../src/models/lobby.ts";
import { LobbyMember } from "../../src/models/lobby-member.ts";
import { LobbyTeamAssignment } from "../../src/models/lobby-team-assignment.ts";
import { MapTemplate } from "../../src/models/map-template.ts";
import { TeamDefinition } from "../../src/models/team-definition.ts";
import { TileType } from "../../src/models/tile-type.ts";
import { registerUser } from "./auth.ts";
import { createLobbyWithFourPlayers } from "./lobby.ts";
import { getSequelize } from "./db.ts";

export interface GameShell {
  gameId: string;
  mapTemplateId: string;
  gameTeamIdBySlot: Map<GameTeamSlot, string>;
  startedAt: Date;
  endsAt: Date;
  visibilityPhaseIntervalSeconds: number;
}

export async function createGameShell(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShell> {
  const lobby = await Lobby.findByPk(lobbyId, { transaction });
  if (!lobby) {
    throw new Error("Lobby not found");
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + lobby.gameDurationSeconds * 1000);

  const game = await Game.create(
    {
      lobbyId,
      mapTemplateId: lobby.mapTemplateId,
      status: "active",
      startedAt,
      endsAt,
      durationSeconds: lobby.gameDurationSeconds,
      handSize: 13,
      slotsPerNode: lobby.slotsPerNode,
      visibilityPhase: 0,
      visibilityPhaseCount: lobby.visibilityPhaseCount,
      visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
      configVersion: 1,
    },
    { transaction },
  );

  const definitions = await TeamDefinition.findAll({
    order: [["sortOrder", "ASC"]],
    transaction,
  });
  const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
  for (let slot = 1; slot <= 4; slot += 1) {
    const definition = definitions[slot - 1];
    if (!definition) {
      throw new Error("Expected four team definitions in catalog");
    }
    const team = await GameTeam.create(
      {
        gameId: game.id,
        teamDefinitionId: definition.id,
        displayName: definition.displayName,
      },
      { transaction },
    );
    gameTeamIdBySlot.set(slot as GameTeamSlot, team.id);
  }

  return {
    gameId: game.id,
    mapTemplateId: lobby.mapTemplateId,
    gameTeamIdBySlot,
    startedAt,
    endsAt,
    visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
  };
}

export async function createGameShellWithMap(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShell & { gameNodeIds: string[] }> {
  const shell = await createGameShell(lobbyId, transaction);
  const cloned = await cloneMapTemplateToGame(
    shell.gameId,
    shell.mapTemplateId,
    transaction,
  );
  return { ...shell, gameNodeIds: cloned.gameNodeIds };
}

export async function withGameShell<T>(
  lobbyId: string,
  fn: (shell: GameShell, transaction: Transaction) => Promise<T>,
): Promise<T> {
  const sequelize = await getSequelize();
  return sequelize.transaction(async (transaction) => {
    const shell = await createGameShell(lobbyId, transaction);
    return fn(shell, transaction);
  });
}

export interface ParticipantFixture {
  userId: string;
  gameTeamId: string;
  teamSlot: GameTeamSlot;
}

export interface StartedGameFixture {
  gameId: string;
  hostUserId: string;
  userIds: string[];
  gameTeamIdBySlot: Map<GameTeamSlot, string>;
  participants: ParticipantFixture[];
}

/**
 * Fully bootstrap a started game (lobby → `startFromLobby`). Returns the
 * mapping from team slot to game-team id so engine tests can address a
 * specific team without re-querying. Pass `defaultStartNodeCode: null` to
 * make teams start unchecked (useful for first-CHECK_IN tests); omit to
 * inherit the template default.
 */
export async function setupStartedGame(
  options: { defaultStartNodeCode?: string | null } = {},
): Promise<StartedGameFixture> {
  const { lobbyId, hostId, userIds } = await createLobbyWithFourPlayers({
    defaultStartNodeCode: options.defaultStartNodeCode,
  });
  const { gameId } = await startFromLobby(lobbyId, hostId);

  const teams = await GameTeam.findAll({
    where: { gameId },
    include: [{ model: TeamDefinition, attributes: ["sortOrder"] }],
  });
  const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
  for (const team of teams) {
    const sortOrder = team.teamDefinition?.sortOrder;
    if (sortOrder == null) {
      throw new Error(`Game team ${team.id} missing team definition sort order`);
    }
    gameTeamIdBySlot.set((sortOrder + 1) as GameTeamSlot, team.id);
  }

  const dbParticipants = await GameParticipant.findAll({ where: { gameId } });
  const participants: ParticipantFixture[] = dbParticipants.map((p) => {
    const slot = [...gameTeamIdBySlot.entries()].find(
      ([, id]) => id === p.gameTeamId,
    )?.[0];
    if (slot == null) {
      throw new Error(`No slot found for participant ${p.id}`);
    }
    return { userId: p.userId, gameTeamId: p.gameTeamId, teamSlot: slot };
  });

  return {
    gameId,
    hostUserId: hostId,
    userIds,
    gameTeamIdBySlot,
    participants,
  };
}

export interface GameShellWithParticipants extends GameShell {
  userIds: string[];
  participants: ParticipantFixture[];
}

/**
 * Light fixture for engine tests: a Game + 4 GameTeams + GameParticipants
 * matching the lobby's team assignments. Skips the map clone and tile deal
 * that `startFromLobby` does, so tests that only need authz + dispatch
 * stay cheap. Requires every lobby member to have a non-null `team_slot`
 * (i.e. lobby was created with `assignTeams: true`).
 */
export async function createGameShellWithParticipants(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShellWithParticipants> {
  const shell = await createGameShell(lobbyId, transaction);

  const [members, assignments] = await Promise.all([
    LobbyMember.findAll({ where: { lobbyId }, transaction }),
    LobbyTeamAssignment.findAll({ where: { lobbyId }, transaction }),
  ]);
  const slotByUserId = new Map(
    assignments.map((a) => [a.userId, a.teamSlot]),
  );

  const participants: ParticipantFixture[] = [];
  for (const member of members) {
    const slot = slotByUserId.get(member.userId);
    if (slot == null || !GAME_TEAM_SLOTS.includes(slot as GameTeamSlot)) {
      throw new Error(
        `createGameShellWithParticipants requires every lobby member to have a teamSlot (user ${member.userId})`,
      );
    }
    const gameTeamId = shell.gameTeamIdBySlot.get(slot as GameTeamSlot);
    if (!gameTeamId) {
      throw new Error(`Missing game team for slot ${slot}`);
    }
    await GameParticipant.create(
      {
        gameId: shell.gameId,
        userId: member.userId,
        gameTeamId,
      },
      { transaction },
    );
    participants.push({
      userId: member.userId,
      gameTeamId,
      teamSlot: slot as GameTeamSlot,
    });
  }

  return {
    ...shell,
    userIds: members.map((m) => m.userId),
    participants,
  };
}

// ---------------------------------------------------------------------------
// Lightweight game fixture (skips map clone, tile deal, visibility bootstrap,
// scheduled jobs). Use when a test only needs some subset of: gameId,
// participants, a few named nodes, a few tile placements, team positions.
// `setupStartedGame` remains the way to exercise the real start flow.
// ---------------------------------------------------------------------------

const NORTH_AMERICA_EAST_OFFSET_SECONDS = 60 * 60;
const ONE_HOUR_SECONDS = 60 * 60;

interface LightweightLobbyParams {
  hostUserId: string;
}

async function findFirstMapTemplateId(): Promise<string> {
  const template = await MapTemplate.findOne({ attributes: ["id"] });
  if (!template) {
    throw new Error(
      "No map template seeded. Lightweight fixtures still need a template_id FK target on lobbies/games; integration tests assume the TTC 2026 seed has run.",
    );
  }
  return template.id;
}

/**
 * `game_nodes.template_node_id` is NOT NULL (and FK RESTRICT) so synthetic
 * lightweight nodes need a real `map_template_nodes` row to point at. We
 * reuse a single arbitrary template node id for every synthetic node since
 * the column is not unique — the seeded TTC stations satisfy the FK either
 * way, but the lightweight fixture never reads back the template node, it
 * just needs the FK to validate.
 */
let cachedTemplateNodeId: string | null = null;
async function getAnyTemplateNodeId(): Promise<string> {
  if (cachedTemplateNodeId == null) {
    const [row] = await (await getSequelize()).query<{ id: string }>(
      'SELECT id FROM map_template_nodes LIMIT 1',
      { type: QueryTypes.SELECT },
    );
    if (!row?.id) {
      throw new Error(
        "No map_template_nodes seeded. Lightweight fixtures need a template node FK target.",
      );
    }
    cachedTemplateNodeId = row.id;
  }
  return cachedTemplateNodeId;
}

async function createLightweightLobby(
  params: LightweightLobbyParams,
): Promise<string> {
  const mapTemplateId = await findFirstMapTemplateId();
  const lobby = await Lobby.create({
    hostUserId: params.hostUserId,
    mapTemplateId,
    gameDurationSeconds: ONE_HOUR_SECONDS,
    visibilityPhaseIntervalSeconds: NORTH_AMERICA_EAST_OFFSET_SECONDS,
    status: "closed",
  });
  return lobby.id;
}

/**
 * Tile-type pool memoized at module scope so we don't re-query 136 catalog
 * rows for every `setupLightweightGame` call. Reset via `truncate` would
 * clear `tile_types`, but the test harness keeps catalog tables intact.
 */
let cachedTileTypeIds: string[] | null = null;
async function getTileTypeIds(): Promise<string[]> {
  if (cachedTileTypeIds == null) {
    const rows = await TileType.findAll({
      attributes: ["id", "copyIndex"],
      order: [["id", "ASC"]],
    });
    cachedTileTypeIds = rows.map((r) => r.id);
    cachedTileTypeIdToCopyIndex = new Map(rows.map((r) => [r.id, r.copyIndex]));
  }
  return cachedTileTypeIds;
}
let cachedTileTypeIdToCopyIndex: Map<string, number> = new Map();

export interface LightweightTileFixture {
  /** `game_tile.id`. */
  gameTileId: string;
  /** `tile_types.id` this tile was minted from. */
  tileTypeId: string;
  /** `game_tile_placement.id`. */
  placementId: string;
}

export interface LightweightNodeTileFixture extends LightweightTileFixture {
  nodeCode: string;
  nodeId: string;
  slotIndex: number;
}

export interface LightweightHandTileFixture extends LightweightTileFixture {
  teamSlot: GameTeamSlot;
  gameTeamId: string;
}

export interface LightweightGameOptions {
  /**
   * Number of participants to create across team slots 1..N. Default 4 (one
   * per team). Set to 0 to skip participant creation entirely (useful for
   * scheduler tests that only need `gameId`).
   */
  participantCount?: 0 | 1 | 2 | 3 | 4;
  /**
   * Game node codes to create. The fixture inserts one `game_nodes` row per
   * code with synthetic coords; no template lineage. Default `[]`. Codes
   * must be unique within the game.
   */
  nodeCodes?: string[];
  /**
   * For each team slot, optional starting station code. The fixture inserts
   * a `game_team_positions` row pointing the team at that node. Default `{}`
   * (no positions; teams start unchecked). The referenced code must appear
   * in `nodeCodes`.
   */
  startNodeCodeBySlot?: Partial<Record<GameTeamSlot, string>>;
  /**
   * For each team slot, how many tiles to deal into that team's hand. Each
   * tile is minted from the seeded `tile_types` catalog in order. Default
   * `{}`. Use when a test exercises hand-side swap logic.
   */
  handTilesBySlot?: Partial<Record<GameTeamSlot, number>>;
  /**
   * For each node code, how many tiles to place at that node (slot indices
   * 0..n-1). Default `{}`. Use when a test exercises node-side swap logic.
   * Tiles are minted from `tile_types` AFTER hand tiles, so callers can
   * reason about distinct catalog assignments by counting hand tiles first.
   */
  nodeTilesByCode?: Record<string, number>;
  /**
   * `games.slots_per_node` snapshot. Default 1. Must be `>=` the max
   * `nodeTilesByCode` value; the fixture asserts this.
   */
  slotsPerNode?: number;
  /**
   * `games.visibility_phase_count`. Default 4. Note the fixture does NOT
   * bootstrap visibility groups, home groups, or `game_location_team_visibility`
   * rows — phase-related tests should use `setupStartedGame` instead.
   */
  visibilityPhaseCount?: number;
  /**
   * `games.slot_unlock_offsets_seconds` snapshot. Defaults to `[0, 0, …]`
   * with `slotsPerNode` entries (all slots unlocked at start), matching
   * the column default in single-slot games. Entry `[0]` MUST be `0`.
   * The fixture does NOT seed `SLOT_UNLOCKED` scheduled jobs for non-zero
   * offsets — scheduler tests that need those should use `setupStartedGame`.
   */
  slotUnlockOffsetsSeconds?: number[];
}

export interface LightweightGameFixture {
  gameId: string;
  hostUserId: string;
  userIds: string[];
  gameTeamIdBySlot: Map<GameTeamSlot, string>;
  participants: ParticipantFixture[];
  /** game_node ids keyed by their `code`. Same nodes the test passed in. */
  nodeIdByCode: Map<string, string>;
  /** All tiles dealt into hands, in deal order. */
  handTiles: LightweightHandTileFixture[];
  /** All tiles placed at nodes, in deal order (then ascending slot_index). */
  nodeTiles: LightweightNodeTileFixture[];
}

/**
 * Build the minimum game state most engine/scheduler/queue tests actually
 * need, bypassing `startFromLobby`. Skips the 84-station map clone, 136-tile
 * deal, visibility bootstrap, and scheduled-job seeding — saves ~2s per
 * test compared with `setupStartedGame`.
 *
 * Returns a fixture that mirrors `StartedGameFixture` for the slots tests
 * commonly read (`gameId`, `participants`, `gameTeamIdBySlot`, `userIds`),
 * plus the synthetic nodes + tiles you asked for.
 *
 * Use `setupStartedGame` instead when a test actually exercises:
 *   - map cloning (cloned `game_nodes`/`game_edges`/`game_lines` fidelity)
 *   - tile dealing (full Fisher–Yates + deal-time invariant)
 *   - visibility bootstrap (groups, home groups, phase-0 face-up rows)
 *   - scheduler job seeding at game start
 *   - any code path that reads from the TTC 2026 catalog by node code
 *     (other than codes you explicitly pass to `nodeCodes`)
 */
export async function setupLightweightGame(
  options: LightweightGameOptions = {},
): Promise<LightweightGameFixture> {
  const participantCount = options.participantCount ?? 4;
  const nodeCodes = options.nodeCodes ?? [];
  const startNodeCodeBySlot = options.startNodeCodeBySlot ?? {};
  const handTilesBySlot = options.handTilesBySlot ?? {};
  const nodeTilesByCode = options.nodeTilesByCode ?? {};
  const slotsPerNode = options.slotsPerNode ?? 1;
  const visibilityPhaseCount = options.visibilityPhaseCount ?? 4;
  const slotUnlockOffsetsSeconds =
    options.slotUnlockOffsetsSeconds ?? new Array(slotsPerNode).fill(0);

  if (slotUnlockOffsetsSeconds.length !== slotsPerNode) {
    throw new Error(
      `setupLightweightGame: slotUnlockOffsetsSeconds length (${slotUnlockOffsetsSeconds.length}) must equal slotsPerNode (${slotsPerNode})`,
    );
  }
  if (slotUnlockOffsetsSeconds[0] !== 0) {
    throw new Error(
      `setupLightweightGame: slotUnlockOffsetsSeconds[0] must be 0; got ${slotUnlockOffsetsSeconds[0]}`,
    );
  }
  for (const count of Object.values(nodeTilesByCode)) {
    if (count > slotsPerNode) {
      throw new Error(
        `setupLightweightGame: nodeTilesByCode value (${count}) exceeds slotsPerNode (${slotsPerNode})`,
      );
    }
  }
  for (const code of Object.values(startNodeCodeBySlot)) {
    if (code != null && !nodeCodes.includes(code)) {
      throw new Error(
        `setupLightweightGame: startNodeCodeBySlot references "${code}" which is not in nodeCodes`,
      );
    }
  }
  for (const code of Object.keys(nodeTilesByCode)) {
    if (!nodeCodes.includes(code)) {
      throw new Error(
        `setupLightweightGame: nodeTilesByCode references "${code}" which is not in nodeCodes`,
      );
    }
  }
  if (new Set(nodeCodes).size !== nodeCodes.length) {
    throw new Error("setupLightweightGame: nodeCodes must be unique");
  }

  const host = await registerUser();
  const hostUserId = host.user.id;
  const userIds: string[] = [hostUserId];
  for (let i = 1; i < participantCount; i += 1) {
    const next = await registerUser();
    userIds.push(next.user.id);
  }

  const lobbyId = await createLightweightLobby({ hostUserId });

  const sequelize = await getSequelize();
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + ONE_HOUR_SECONDS * 1000);

  const result = await sequelize.transaction(async (transaction) => {
    const game = await Game.create(
      {
        lobbyId,
        mapTemplateId: (await Lobby.findByPk(lobbyId, { transaction }))!
          .mapTemplateId,
        status: "active",
        startedAt,
        endsAt,
        durationSeconds: ONE_HOUR_SECONDS,
        handSize: 13,
        slotsPerNode,
        visibilityPhase: 0,
        visibilityPhaseCount,
        visibilityPhaseIntervalSeconds: ONE_HOUR_SECONDS,
        slotUnlockOffsetsSeconds,
        slotMapVisible: new Array(slotsPerNode).fill(true),
        configVersion: 1,
      },
      { transaction },
    );

    const definitions = await TeamDefinition.findAll({
      order: [["sortOrder", "ASC"]],
      transaction,
    });
    const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
    for (let slot = 1; slot <= 4; slot += 1) {
      const definition = definitions[slot - 1];
      if (!definition) {
        throw new Error("Expected four team definitions in catalog");
      }
      const team = await GameTeam.create(
        {
          gameId: game.id,
          teamDefinitionId: definition.id,
          displayName: definition.displayName,
        },
        { transaction },
      );
      gameTeamIdBySlot.set(slot as GameTeamSlot, team.id);
    }

    const participants: ParticipantFixture[] = [];
    for (let i = 0; i < participantCount; i += 1) {
      const slot = (i + 1) as GameTeamSlot;
      const gameTeamId = gameTeamIdBySlot.get(slot)!;
      await GameParticipant.create(
        { gameId: game.id, userId: userIds[i]!, gameTeamId },
        { transaction },
      );
      participants.push({ userId: userIds[i]!, gameTeamId, teamSlot: slot });
    }

    const nodeIdByCode = new Map<string, string>();
    if (nodeCodes.length > 0) {
      const templateNodeId = await getAnyTemplateNodeId();
      const nodes = await GameNode.bulkCreate(
        nodeCodes.map((code, index) => ({
          gameId: game.id,
          templateNodeId,
          code,
          name: code,
          latitude: 43.65 + index * 0.001,
          longitude: -79.38 + index * 0.001,
          geofenceRadiusMeters: 100,
          coordinateX: index * 10,
          coordinateY: 0,
          labelAnchor: "n",
          labelRotate: null,
          isInterchange: false,
        })),
        { transaction, returning: true },
      );
      for (const node of nodes) {
        nodeIdByCode.set(node.code, node.id);
      }
    }

    // Every team gets a position row (matches game-start-service behavior).
    // `currentGameNodeId` is null unless `startNodeCodeBySlot` provides one,
    // which mirrors `startFromLobby({ defaultStartNodeCode: null })` vs a
    // specific code. The CHECK_IN/CHECK_OUT handlers throw 500 if the
    // position row is missing.
    for (const [slot, gameTeamId] of gameTeamIdBySlot) {
      const code = startNodeCodeBySlot[slot];
      const nodeId = code != null ? nodeIdByCode.get(code) ?? null : null;
      await GameTeamPosition.create(
        {
          gameTeamId,
          currentGameNodeId: nodeId,
          checkedInAt: nodeId != null ? startedAt : null,
        },
        { transaction },
      );
    }

    let tileTypeOffset = 0;
    const tileTypeIds = await getTileTypeIds();
    const totalRequested =
      Object.values(handTilesBySlot).reduce<number>(
        (sum, n) => sum + (n ?? 0),
        0,
      ) +
      Object.values(nodeTilesByCode).reduce<number>((sum, n) => sum + n, 0);
    if (totalRequested > tileTypeIds.length) {
      throw new Error(
        `setupLightweightGame: requested ${totalRequested} tiles but the catalog only has ${tileTypeIds.length}`,
      );
    }

    const handTiles: LightweightHandTileFixture[] = [];
    for (const [slot, count] of Object.entries(handTilesBySlot) as Array<
      [string, number | undefined]
    >) {
      const n = count ?? 0;
      if (n <= 0) continue;
      const slotNum = Number(slot) as GameTeamSlot;
      const gameTeamId = gameTeamIdBySlot.get(slotNum);
      if (!gameTeamId) continue;
      for (let i = 0; i < n; i += 1) {
        const tileTypeId = tileTypeIds[tileTypeOffset++]!;
        const gameTile = await GameTile.create(
          {
            gameId: game.id,
            tileTypeId,
            copyIndex: cachedTileTypeIdToCopyIndex.get(tileTypeId)!,
          },
          { transaction },
        );
        const placement = await GameTilePlacement.create(
          {
            gameTileId: gameTile.id,
            gameNodeId: null,
            gameTeamId,
            slotIndex: null,
          },
          { transaction },
        );
        handTiles.push({
          teamSlot: slotNum,
          gameTeamId,
          gameTileId: gameTile.id,
          tileTypeId,
          placementId: placement.id,
        });
      }
    }

    const nodeTiles: LightweightNodeTileFixture[] = [];
    for (const [code, count] of Object.entries(nodeTilesByCode)) {
      const nodeId = nodeIdByCode.get(code)!;
      for (let s = 0; s < count; s += 1) {
        const tileTypeId = tileTypeIds[tileTypeOffset++]!;
        const gameTile = await GameTile.create(
          {
            gameId: game.id,
            tileTypeId,
            copyIndex: cachedTileTypeIdToCopyIndex.get(tileTypeId)!,
          },
          { transaction },
        );
        const placement = await GameTilePlacement.create(
          {
            gameTileId: gameTile.id,
            gameNodeId: nodeId,
            gameTeamId: null,
            slotIndex: s,
          },
          { transaction },
        );
        nodeTiles.push({
          nodeCode: code,
          nodeId,
          slotIndex: s,
          gameTileId: gameTile.id,
          tileTypeId,
          placementId: placement.id,
        });
      }
    }

    return {
      gameId: game.id,
      gameTeamIdBySlot,
      participants,
      nodeIdByCode,
      handTiles,
      nodeTiles,
    };
  });

  return {
    gameId: result.gameId,
    hostUserId,
    userIds,
    gameTeamIdBySlot: result.gameTeamIdBySlot,
    participants: result.participants,
    nodeIdByCode: result.nodeIdByCode,
    handTiles: result.handTiles,
    nodeTiles: result.nodeTiles,
  };
}
