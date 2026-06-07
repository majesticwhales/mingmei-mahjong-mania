import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Challenge } from "../models/challenge.ts";
import { Game, type GameStatus } from "../models/game.ts";
import { GameChallengeInstance } from "../models/game-challenge-instance.ts";
import { GameEdge } from "../models/game-edge.ts";
import { GameLine } from "../models/game-line.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";
import { GameRuleFlag } from "../models/game-rule-flag.ts";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";
import { GameTeam } from "../models/game-team.ts";
import { GameTeamPosition } from "../models/game-team-position.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import {
  type AnalyzeHandResult,
  analyzeHand,
  type DoraIndicator,
  type WindRank,
} from "../scoring/index.ts";
import {
  mapVisibleSlotIndices,
  unlockedSlotIndices,
} from "../services/slot-visibility.ts";
import {
  RED_FIVES_RULE_KEY,
  isRedFiveForGame,
} from "../tiles/red-five.ts";
import {
  selectRecentEvents,
  type RecentEventDto,
} from "./recent-events.ts";

/**
 * Team-scoped `game.state` projection (TDD §6.3). Produced from a snapshot
 * of the world for a single team; the caller is responsible for emitting
 * one projection per team after every state change (chunk 4 wires this up
 * via the `Broadcaster`).
 *
 * No mutation. No transaction. No fog re-derivation inside callers — the
 * projection layer is the only place that applies team visibility, slot
 * unlock, and slot map-visibility rules to user-facing tile data.
 */

export interface TileDto {
  /** `game_tiles.id` — stable across the game's lifetime. */
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

/** Multi-slot map / station entry. */
export interface SlotTileDto {
  slotIndex: number;
  tile: TileDto;
}

/** Layout + visibility-gated tile data for a single map node. */
export interface MapNodeDto {
  id: string;
  code: string;
  name: string;
  coordinateX: number;
  coordinateY: number;
  /** `game_lines.code` values, ordered by `game_lines.sort_order` ASC. */
  lineIds: string[];
  labelAnchor: string;
  labelRotate: number | null;
  isInterchange: boolean;
  latitude: number;
  longitude: number;
  /** Present when `slots_per_node === 1` and the node is face-up for the team. */
  tile?: TileDto;
  /** Present when `slots_per_node > 1` and the node is face-up for the team. */
  tiles?: SlotTileDto[];
}

export interface MapLineDto {
  code: string;
  name: string | null;
  shortName: string | null;
  color: string | null;
  sortOrder: number;
  renderMetadata: GameLine["renderMetadata"];
}

export interface MapEdgeDto {
  fromNodeId: string;
  toNodeId: string;
}

/**
 * The team's relationship with the top challenge at their current station,
 * if any (TDD §3.8 honor-system flow). Three observable states:
 *
 * - `available`: the team can issue `START_CHALLENGE`. Either they have
 *   never attempted this node challenge or the prior attempt's cooldown
 *   has elapsed.
 * - `in_progress`: the team has an open `game_challenge_instances` row
 *   for this challenge. `instanceId` is the row's id (the client passes
 *   it back via `CHALLENGE_COMPLETED` / `CHALLENGE_FORFEITED`).
 * - `cooldown`: the team resolved this challenge recently and must wait.
 *   `cooldownUntil` is the wall-clock cut-off (ISO 8601).
 *
 * MVP exposes only the `sort_order=0` challenge per station; the
 * multi-challenge queue is forward-compatible.
 */
export interface AtStationChallengeDto {
  /** `challenges.id` of the top challenge at the station. */
  challengeId: string;
  title: string;
  description: string | null;
  flavorText: string | null;
  status: "available" | "in_progress" | "cooldown";
  /** Present when `status === "in_progress"`. */
  instanceId?: string;
  /** Present when `status === "cooldown"`. */
  cooldownUntil?: string;
}

export interface AtStationDto {
  nodeId: string;
  code: string;
  /** Present when `slots_per_node === 1`. */
  tile?: TileDto;
  /** Present when `slots_per_node > 1`. */
  tiles?: SlotTileDto[];
  /**
   * Phase H: top challenge at the station + the team's current
   * relationship with it (TDD §3.8). `null` when the station has no
   * `game_node_challenges` rows (back-compat path).
   */
  currentChallenge: AtStationChallengeDto | null;
  /**
   * Phase H: true between `CHALLENGE_COMPLETED` and the next `SWAP_TILE`.
   * Consumed by `SWAP_TILE`; reset to false on every `CHECK_IN` /
   * `CHECK_OUT`.
   */
  pendingSwapCredit: boolean;
  /**
   * Phase H: sticky within a single check-in session — flipped true on
   * `CHALLENGE_COMPLETED`, stays true through the credit-consuming
   * `SWAP_TILE`, resets on every `CHECK_IN` / `CHECK_OUT`. Used by
   * `START_CHALLENGE` to enforce "at most one credit per session"; the
   * client uses it to gray out the "Start challenge" button after the
   * team has already cashed in.
   */
  creditEarnedInSession: boolean;
}

export interface HandTileDto extends TileDto {
  /** Server-assigned hand-sort ordinal `[0, handSize)`. */
  slotIndex: number;
}

export interface GameStateProjection {
  gameId: string;
  status: GameStatus;
  endsAt: string;
  /**
   * Earliest pending `VISIBILITY_PHASE_ADVANCE` job's `runAt`, or `null`
   * when none are scheduled (e.g. game is in its terminal phase). The
   * client uses this for the visibility-countdown banner; no global
   * `visibilityPhase` is exposed.
   */
  nextVisibilityChangeAt: string | null;
  mapNodes: MapNodeDto[];
  mapLines: MapLineDto[];
  mapEdges: MapEdgeDto[];
  atStation: AtStationDto | null;
  handTiles: HandTileDto[];
  recentEvents: RecentEventDto[];
  /**
   * Wind ranks (1=East, 2=South, 3=West, 4=North) feeding the scoring
   * module's yakuhai detection. `roundWind` is randomized per game;
   * `seatWind` is derived from the team's `team_definition.code`.
   */
  roundWind: WindRank;
  seatWind: WindRank;
  /**
   * Revealed dora indicator (the dead-wall tile at `dead_wall_index = 0`),
   * or `null` when the game has no dead wall (`games.dead_wall_size = 0`)
   * or the dealer didn't park an indicator at index 0. Visible to every
   * team (the dora indicator is public information in standard riichi).
   * The scoring module's `analyzeHand` consumes the indicator via
   * `doraIndicators` to add `+1 han per matching tile` in the winning
   * hand; see §3.9.
   */
  doraIndicator: TileDto | null;
  /**
   * Riichi shanten / tenpai analysis for the team's hand. Present when the
   * hand has 13 or 14 tiles (the only sizes the scoring module supports);
   * `undefined` otherwise (e.g. mid-swap transients or non-standard
   * `games.hand_size`). See §3.9 for the shape.
   */
  handAnalysis?: AnalyzeHandResult;
}

export interface BuildGameStateProjectionOptions {
  /**
   * Pin the wall-clock instant the projection evaluates per-slot unlock
   * rules against. Defaults to a fresh `Date()` at call time. The
   * broadcaster passes a single pinned `now` to keep every team's
   * projection internally consistent at a state-change boundary
   * (chunk 4) — handy for replay / tests too.
   */
  now?: Date;
}

interface PlacementRow {
  placement_id: string;
  game_node_id: string | null;
  game_team_id: string | null;
  slot_index: number | null;
  dead_wall_index: number | null;
  game_tile_id: string;
  copy_index: number;
  suit: string;
  rank: number;
  suit_sort_order: number;
  display_name: string;
}

interface NodeLineRow {
  game_node_id: string;
  code: string;
}

/**
 * Build the projection for one team's view of a game. Reads only — no
 * transaction required. Throws `404 not_found` if the game or team
 * doesn't exist; `400 wrong_game` if the team doesn't belong to the
 * game.
 */
export async function buildGameStateProjection(
  gameId: string,
  gameTeamId: string,
  options: BuildGameStateProjectionOptions = {},
): Promise<GameStateProjection> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  const game = await Game.findByPk(gameId);
  if (!game) {
    throw new HttpError(404, "not_found", `Game not found: ${gameId}`);
  }

  const team = await GameTeam.findByPk(gameTeamId, {
    include: [TeamDefinition],
  });
  if (!team) {
    throw new HttpError(404, "not_found", `Game team not found: ${gameTeamId}`);
  }
  if (team.gameId !== gameId) {
    throw new HttpError(
      400,
      "wrong_game",
      `Game team ${gameTeamId} does not belong to game ${gameId}`,
    );
  }

  const seatWind = teamCodeToWindRank(team.teamDefinition?.code);
  if (seatWind === null) {
    throw new HttpError(
      500,
      "internal_error",
      `Cannot derive seat wind for team ${gameTeamId} (code: ${team.teamDefinition?.code ?? "<missing>"})`,
    );
  }
  const roundWind = game.roundWind as WindRank;

  const [
    redFivesFlag,
    teamPosition,
    nodes,
    nodeLineRows,
    lines,
    edges,
    visibilityRows,
    placementRows,
    nextVisibilityJob,
    recentEvents,
  ] = await Promise.all([
    GameRuleFlag.findOne({
      where: { gameId, ruleKey: RED_FIVES_RULE_KEY },
    }),
    GameTeamPosition.findOne({ where: { gameTeamId } }),
    GameNode.findAll({ where: { gameId }, order: [["code", "ASC"]] }),
    sequelize.query<NodeLineRow>(
      `SELECT nl.game_node_id, gl.code
       FROM game_node_lines nl
       INNER JOIN game_lines gl ON gl.id = nl.game_line_id
       WHERE gl.game_id = :gameId
       ORDER BY gl.sort_order ASC, gl.code ASC`,
      { replacements: { gameId }, type: QueryTypes.SELECT },
    ),
    GameLine.findAll({
      where: { gameId },
      order: [
        ["sortOrder", "ASC"],
        ["code", "ASC"],
      ],
    }),
    GameEdge.findAll({ where: { gameId }, order: [["id", "ASC"]] }),
    GameLocationTeamVisibility.findAll({
      where: { gameTeamId, isFaceUp: true },
    }),
    sequelize.query<PlacementRow>(
      `SELECT p.id              AS placement_id,
              p.game_node_id    AS game_node_id,
              p.game_team_id    AS game_team_id,
              p.slot_index      AS slot_index,
              p.dead_wall_index AS dead_wall_index,
              t.id              AS game_tile_id,
              t.copy_index      AS copy_index,
              tt.suit           AS suit,
              tt.rank           AS rank,
              tt.suit_sort_order AS suit_sort_order,
              tt.display_name   AS display_name
       FROM game_tile_placements p
       INNER JOIN game_tiles t  ON t.id = p.game_tile_id
       INNER JOIN tile_types tt ON tt.id = t.tile_type_id
       WHERE t.game_id = :gameId`,
      { replacements: { gameId }, type: QueryTypes.SELECT },
    ),
    GameScheduledJob.findOne({
      where: {
        gameId,
        jobType: "VISIBILITY_PHASE_ADVANCE",
        status: "pending",
      },
      order: [["runAt", "ASC"]],
    }),
    selectRecentEvents(gameId),
  ]);

  const redFivesEnabled = redFivesFlag?.enabled ?? false;
  const slotsPerNode = game.slotsPerNode;
  const multiSlot = slotsPerNode > 1;

  const lineIdsByNode = new Map<string, string[]>();
  for (const row of nodeLineRows) {
    const arr = lineIdsByNode.get(row.game_node_id) ?? [];
    arr.push(row.code);
    lineIdsByNode.set(row.game_node_id, arr);
  }

  const faceUpNodeIds = new Set<string>();
  for (const row of visibilityRows) {
    faceUpNodeIds.add(row.gameNodeId);
  }

  interface TileWithSort {
    tile: TileDto;
    suitSortOrder: number;
    rank: number;
    copyIndex: number;
  }
  const tilesByNodeSlot = new Map<string, Map<number, TileDto>>();
  const ownHandTiles: TileWithSort[] = [];
  // The dora indicator is the dead-wall tile at index 0. It's public —
  // identical for every team's projection — so we capture it during the
  // single placement scan rather than reissuing the query per team.
  let doraIndicator: TileDto | null = null;

  for (const row of placementRows) {
    const tile: TileDto = {
      instanceId: row.game_tile_id,
      suit: row.suit,
      rank: row.rank,
      copyIndex: row.copy_index,
      displayName: row.display_name,
      isRedFive: isRedFiveForGame(
        { suit: row.suit, rank: row.rank, copyIndex: row.copy_index },
        redFivesEnabled,
      ),
    };

    if (row.game_node_id != null && row.slot_index != null) {
      let bySlot = tilesByNodeSlot.get(row.game_node_id);
      if (!bySlot) {
        bySlot = new Map();
        tilesByNodeSlot.set(row.game_node_id, bySlot);
      }
      bySlot.set(row.slot_index, tile);
    } else if (row.game_team_id === gameTeamId) {
      ownHandTiles.push({
        tile,
        suitSortOrder: row.suit_sort_order,
        rank: row.rank,
        copyIndex: row.copy_index,
      });
    } else if (row.dead_wall_index === 0) {
      doraIndicator = tile;
    }
  }

  const mapVisibleSlots = multiSlot
    ? mapVisibleSlotIndices(game.slotMapVisible, slotsPerNode)
    : [0];

  const mapNodes: MapNodeDto[] = nodes.map((node) => {
    const dto: MapNodeDto = {
      id: node.id,
      code: node.code,
      name: node.name,
      coordinateX: node.coordinateX,
      coordinateY: node.coordinateY,
      lineIds: lineIdsByNode.get(node.id) ?? [],
      labelAnchor: node.labelAnchor,
      labelRotate: node.labelRotate,
      isInterchange: node.isInterchange,
      latitude: node.latitude,
      longitude: node.longitude,
    };

    if (!faceUpNodeIds.has(node.id)) {
      return dto;
    }

    const bySlot = tilesByNodeSlot.get(node.id);
    if (!bySlot) {
      return dto;
    }

    if (multiSlot) {
      const entries: SlotTileDto[] = [];
      for (const slotIndex of mapVisibleSlots) {
        const tile = bySlot.get(slotIndex);
        if (tile) {
          entries.push({ slotIndex, tile });
        }
      }
      if (entries.length > 0) {
        dto.tiles = entries;
      }
    } else {
      const tile = bySlot.get(0);
      if (tile) {
        dto.tile = tile;
      }
    }

    return dto;
  });

  const mapLines: MapLineDto[] = lines.map((line) => ({
    code: line.code,
    name: line.name,
    shortName: line.shortName,
    color: line.color,
    sortOrder: line.sortOrder,
    renderMetadata: line.renderMetadata,
  }));

  const mapEdges: MapEdgeDto[] = edges.map((edge) => ({
    fromNodeId: edge.fromGameNodeId,
    toNodeId: edge.toGameNodeId,
  }));

  // Phase H: challenge-state lookup. Only meaningful when the team is
  // checked in; skip the round trip entirely otherwise (the projection
  // is hot on the broadcaster path). Separate query from the placement
  // fan-out above because the result depends on the team's position,
  // which is itself loaded in the `Promise.all` block — chaining keeps
  // the await graph straightforward.
  const currentChallenge =
    teamPosition?.currentGameNodeId != null
      ? await buildCurrentChallenge({
          gameNodeId: teamPosition.currentGameNodeId,
          gameTeamId,
          nowMs,
        })
      : null;

  const atStation = buildAtStation({
    game,
    teamPosition,
    nodes,
    tilesByNodeSlot,
    multiSlot,
    nowMs,
    currentChallenge,
  });

  ownHandTiles.sort(handTileSortComparator);
  const handTiles: HandTileDto[] = ownHandTiles.map((entry, index) => ({
    slotIndex: index,
    ...entry.tile,
  }));

  // Scoring analysis is only meaningful at the canonical 13 / 14-tile shape.
  // Other sizes (configurable `games.hand_size`, mid-swap transients) skip
  // the call rather than throw. We pass the dora indicator (as a
  // suit+rank pair — the scoring module ignores `copyIndex`) whenever
  // one is exposed, so `analyzeHand` can add the dora bonus on top of
  // any winning waits.
  let handAnalysis: AnalyzeHandResult | undefined;
  if (handTiles.length === 13 || handTiles.length === 14) {
    handAnalysis = analyzeHand({
      tiles: handTiles.map((t) => ({
        suit: t.suit,
        rank: t.rank,
        copyIndex: t.copyIndex,
      })),
      seatWind,
      roundWind,
      redFivesEnabled,
      doraIndicators: indicatorToScoringInput(doraIndicator),
    });
  }

  return {
    gameId,
    status: game.status,
    endsAt: game.endsAt.toISOString(),
    nextVisibilityChangeAt:
      nextVisibilityJob?.runAt.toISOString() ?? null,
    mapNodes,
    mapLines,
    mapEdges,
    atStation,
    handTiles,
    recentEvents,
    roundWind,
    seatWind,
    doraIndicator,
    handAnalysis,
  };
}

/**
 * Reduce a dora-indicator `TileDto` to the scoring module's
 * `DoraIndicator` shape (suit + rank only; `copyIndex` is irrelevant
 * for dora). Returns an empty array when no indicator is exposed so
 * `analyzeHand` can treat the projection as no-dora without extra
 * branching at the call site. The `suit` cast is unchecked here; the
 * downstream `indicatorToDoraTileType` throws on unrecognised suits,
 * so a malformed `tile_types` row would surface as a clear error
 * rather than silently producing wrong scores.
 */
function indicatorToScoringInput(
  indicator: TileDto | null,
): DoraIndicator[] {
  if (indicator === null) return [];
  return [
    { suit: indicator.suit as DoraIndicator["suit"], rank: indicator.rank },
  ];
}

/** Map a `team_definitions.code` to the scoring module's wind rank. The
 *  canonical seed uses `east / south / west / north`; anything else returns
 *  `null` so callers can surface a clear error rather than silently
 *  computing wrong scores. */
function teamCodeToWindRank(code: string | undefined): WindRank | null {
  switch (code) {
    case "east":
      return 1;
    case "south":
      return 2;
    case "west":
      return 3;
    case "north":
      return 4;
    default:
      return null;
  }
}

function buildAtStation(params: {
  game: Game;
  teamPosition: GameTeamPosition | null;
  nodes: GameNode[];
  tilesByNodeSlot: Map<string, Map<number, TileDto>>;
  multiSlot: boolean;
  nowMs: number;
  currentChallenge: AtStationChallengeDto | null;
}): AtStationDto | null {
  const {
    game,
    teamPosition,
    nodes,
    tilesByNodeSlot,
    multiSlot,
    nowMs,
    currentChallenge,
  } = params;
  const nodeId = teamPosition?.currentGameNodeId;
  if (!nodeId) {
    return null;
  }
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return null;
  }
  const bySlot = tilesByNodeSlot.get(node.id);
  const dto: AtStationDto = {
    nodeId: node.id,
    code: node.code,
    currentChallenge,
    pendingSwapCredit: teamPosition.pendingSwapCredit,
    creditEarnedInSession: teamPosition.creditEarnedInSession,
  };

  if (multiSlot) {
    const unlocked = unlockedSlotIndices(game, game.slotsPerNode, nowMs);
    const entries: SlotTileDto[] = [];
    if (bySlot) {
      for (const slotIndex of unlocked) {
        const tile = bySlot.get(slotIndex);
        if (tile) {
          entries.push({ slotIndex, tile });
        }
      }
    }
    if (entries.length > 0) {
      dto.tiles = entries;
    }
  } else if (bySlot) {
    const tile = bySlot.get(0);
    if (tile) {
      dto.tile = tile;
    }
  }

  return dto;
}

/**
 * Resolve the top challenge at a station plus the team's relationship
 * with it (TDD §3.8). Two queries:
 *
 *   1. The `sort_order=0` `game_node_challenges` row + its catalog
 *      `challenges` row (title / description / flavour text).
 *   2. The team's most recent `game_challenge_instances` row for that
 *      node-challenge, used to derive the three observable states.
 *
 * Returns `null` when the station has no challenges configured (the
 * back-compat path). Pure read — never mutates state.
 */
async function buildCurrentChallenge(params: {
  gameNodeId: string;
  gameTeamId: string;
  nowMs: number;
}): Promise<AtStationChallengeDto | null> {
  const { gameNodeId, gameTeamId, nowMs } = params;

  const topRow = await GameNodeChallenge.findOne({
    where: { gameNodeId },
    order: [["sortOrder", "ASC"]],
    include: [
      {
        model: Challenge,
        required: true,
        attributes: ["id", "title", "description", "flavorText"],
      },
    ],
  });
  if (!topRow || !topRow.challenge) {
    return null;
  }

  const latestInstance = await GameChallengeInstance.findOne({
    where: { gameTeamId, gameNodeChallengeId: topRow.id },
    order: [["createdAt", "DESC"]],
  });

  let status: AtStationChallengeDto["status"] = "available";
  let instanceId: string | undefined;
  let cooldownUntil: string | undefined;
  if (latestInstance) {
    if (latestInstance.status === "in_progress") {
      status = "in_progress";
      instanceId = latestInstance.id;
    } else if (
      latestInstance.cooldownUntil != null &&
      latestInstance.cooldownUntil.getTime() > nowMs
    ) {
      status = "cooldown";
      cooldownUntil = latestInstance.cooldownUntil.toISOString();
    }
  }

  return {
    challengeId: topRow.challenge.id,
    title: topRow.challenge.title,
    description: topRow.challenge.description,
    flavorText: topRow.challenge.flavorText,
    status,
    ...(instanceId !== undefined ? { instanceId } : {}),
    ...(cooldownUntil !== undefined ? { cooldownUntil } : {}),
  };
}

function handTileSortComparator(
  a: { suitSortOrder: number; rank: number; copyIndex: number },
  b: { suitSortOrder: number; rank: number; copyIndex: number },
): number {
  if (a.suitSortOrder !== b.suitSortOrder) {
    return a.suitSortOrder - b.suitSortOrder;
  }
  if (a.rank !== b.rank) {
    return a.rank - b.rank;
  }
  return a.copyIndex - b.copyIndex;
}
