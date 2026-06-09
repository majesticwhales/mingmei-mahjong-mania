import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import { visibilityIncludes } from "../game/visibility-mode.ts";
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
import { teamCodeToWindRank } from "../scoring/seat-wind.ts";
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

/**
 * Phase J: a single yaku contributing han to a winning hand. Mirrors
 * the per-yaku entries the scoring module emits on `AnalyzedWait.yaku`.
 * Surfaced to the requesting team so the client can render the score
 * breakdown without re-running `analyzeHand`.
 */
export interface FinalYakuDto {
  name: string;
  han: number;
}

/**
 * Phase J: snapshot of the requesting team's completed hand. Populated
 * only when **the requesting team's** `game_teams.hand_completed_at` is
 * non-null — other teams' completion details are exposed at game end
 * via `GET /api/games/:id/summary` (chunk 5), never on the live
 * projection.
 */
export interface HandCompletedDto {
  /** ISO timestamp of the `CLAIM_WIN` that snapshotted the team. */
  completedAt: string;
  /** The station tile the team claimed as their winning 14th tile. */
  winningTile: TileDto;
  /** `game_nodes.code` of the station where the win was claimed. */
  winningNodeCode: string;
  finalHan: number;
  finalFu: number;
  finalPoints: number;
  finalYaku: FinalYakuDto[];
}

/**
 * Phase J: per-team entry advertising which teams have completed their
 * hand and when. Visible to every projection (no per-team redaction)
 * because completion order is public information used by the client to
 * render the in-game "X teams done" banner and to short-circuit the
 * claim-win UI on subsequent renders.
 */
export interface TeamsCompletedEntryDto {
  gameTeamId: string;
  teamCode: string;
  completedAt: string;
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
  /**
   * Phase J: snapshot of the requesting team's completed hand. `null`
   * until the team submits a successful `CLAIM_WIN`; from then on, the
   * field is populated for every projection until game end. Other
   * teams' completion details never appear here.
   */
  handCompleted: HandCompletedDto | null;
  /**
   * Phase J: completion-order roster across every team in the game.
   * Present on every projection (no per-team redaction); a non-empty
   * list signals that some team has claimed a winning hand and the
   * client can render the "teams completed" banner. Sorted by
   * `completedAt ASC`.
   */
  teamsCompleted: TeamsCompletedEntryDto[];
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
    allTeams,
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
    selectRecentEvents(gameId, { requestingGameTeamId: gameTeamId }),
    // Phase J: every game team + their team definition, used for the
    // `teamsCompleted` roster and (when the requesting team is the
    // completing one) the `handCompleted` snapshot. We include the
    // requesting team here too so the single `findAll` covers both the
    // earlier solo lookup and the roster; the dedicated `team` query
    // above stays in place because it needs the same row but eagerly
    // resolved (the `Promise.all` runs concurrently with it).
    GameTeam.findAll({
      where: { gameId },
      include: [TeamDefinition],
    }),
  ]);

  const redFivesEnabled = redFivesFlag?.enabled ?? false;
  const slotsPerNode = game.slotsPerNode;
  const multiSlot = slotsPerNode > 1;

  // Per-game visibility-mode flags. The two layers are independently
  // gated at this projection: phase off means every node is face-up
  // (visibility groups are skipped); slot off means every slot is
  // unlocked + map-visible (per-slot tier rules are skipped). The
  // engine doesn't seed the corresponding bootstrap rows / scheduled
  // jobs for the off layer, so reading the live game state would
  // already produce an "always face-up" / "always unlocked" effect
  // for in-flight games — but we still gate the projection so a
  // game that started before the migration (back-compat `both`) and
  // then had its mode patched later still behaves correctly.
  const phaseLayerActive = visibilityIncludes(game.visibilityMode, "phase");
  const slotLayerActive = visibilityIncludes(game.visibilityMode, "slot");

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
  // Phase J: side index of `game_tile.id → TileDto`, built during the
  // single placement scan so the `handCompleted` snapshot can resolve
  // the team's `winning_tile_id` without re-querying. After CLAIM_WIN
  // the winning tile's placement is `(game_team_id = thisTeam,
  // slot_index = null)`, so it lands here through the `ownHandTiles`
  // branch — exactly the placement the lookup needs.
  const tileById = new Map<string, TileDto>();
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
    tileById.set(row.game_tile_id, tile);

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

  // When the slot layer is off, treat every slot as map-visible. The
  // host can't have flipped any `slot_map_visible[k>0]` to false in
  // that mode (chunk-2 knob lock), but games that switched mode
  // mid-flight could still have stale `false` entries from the prior
  // mode — the projection ignores them so the layout is consistent.
  const mapVisibleSlots = !slotLayerActive
    ? Array.from({ length: slotsPerNode }, (_v, k) => k)
    : multiSlot
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

    // When the phase layer is off, every node is treated as face-up
    // — the team's `game_location_team_visibility` rows are absent
    // because `bootstrapGameVisibility` was skipped at start, so we
    // bypass the gate entirely rather than checking the empty set.
    if (phaseLayerActive && !faceUpNodeIds.has(node.id)) {
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

  // Phase J: hand-completed teams are locked out of every tile mutation.
  // The projection short-circuits `atStation` (and its `currentChallenge`
  // sub-fetch) to `null` so the client UI flips from swap controls /
  // challenge prompts to the read-only "hand completed" branch. The
  // team's `current_game_node_id` is intentionally NOT cleared by
  // `CLAIM_WIN` (mirroring the post-game audit trail), so this gating
  // lives at the projection layer rather than the position table.
  const handCompletedFlag = team.handCompletedAt != null;

  // Phase H: challenge-state lookup. Only meaningful when the team is
  // checked in and not yet hand-completed; skip the round trip entirely
  // otherwise (the projection is hot on the broadcaster path). Separate
  // query from the placement fan-out above because the result depends
  // on the team's position, which is itself loaded in the `Promise.all`
  // block — chaining keeps the await graph straightforward.
  const currentChallenge =
    !handCompletedFlag && teamPosition?.currentGameNodeId != null
      ? await buildCurrentChallenge({
          gameNodeId: teamPosition.currentGameNodeId,
          gameTeamId,
          nowMs,
        })
      : null;

  const atStation = handCompletedFlag
    ? null
    : buildAtStation({
        game,
        teamPosition,
        nodes,
        tilesByNodeSlot,
        multiSlot,
        nowMs,
        currentChallenge,
        slotLayerActive,
      });

  ownHandTiles.sort(handTileSortComparator);
  const handTiles: HandTileDto[] = ownHandTiles.map((entry, index) => ({
    slotIndex: index,
    ...entry.tile,
  }));

  // Phase J: teamsCompleted roster (every team), sorted by completion
  // order. Public information — no per-team redaction — so the client
  // can render a "N teams done" banner during play. Other teams' final
  // scores / yaku land at game end via `GET /api/games/:id/summary`
  // (chunk 5), never on the live projection.
  const teamsCompleted: TeamsCompletedEntryDto[] = allTeams
    .filter((t) => t.handCompletedAt != null)
    .sort((a, b) => a.handCompletedAt!.getTime() - b.handCompletedAt!.getTime())
    .map((t) => {
      const code = t.teamDefinition?.code;
      if (code == null) {
        // Every game team is created with a `team_definition_id` FK, so
        // an absent code points to a query bug rather than data drift —
        // fail loud rather than emit an entry with a synthetic id.
        throw new HttpError(
          500,
          "internal_error",
          `Game team ${t.id} missing team_definition.code in projection`,
        );
      }
      return {
        gameTeamId: t.id,
        teamCode: code,
        completedAt: t.handCompletedAt!.toISOString(),
      };
    });

  // Phase J: per-team `handCompleted` snapshot, populated only when the
  // **requesting team** is the completing one. The placement scan above
  // already produced a `TileDto` for the winning tile (now a hand
  // placement on the requesting team), and the `nodes` array carries
  // the station the win was claimed at.
  let handCompleted: HandCompletedDto | null = null;
  if (handCompletedFlag) {
    if (
      team.winningTileId == null ||
      team.winningNodeId == null ||
      team.finalHan == null ||
      team.finalFu == null ||
      team.finalPoints == null ||
      team.finalYakuKeys == null
    ) {
      // The multi-column CHECK on `game_teams` enforces consistency at
      // write time, so an inconsistent snapshot here is a bug worth
      // surfacing rather than silently dropping the DTO.
      throw new HttpError(
        500,
        "internal_error",
        `Game team ${gameTeamId} has hand_completed_at but missing snapshot columns`,
      );
    }
    const winningTile = tileById.get(team.winningTileId);
    if (!winningTile) {
      throw new HttpError(
        500,
        "internal_error",
        `Winning tile ${team.winningTileId} for team ${gameTeamId} not found in placements`,
      );
    }
    const winningNode = nodes.find((n) => n.id === team.winningNodeId);
    if (!winningNode) {
      throw new HttpError(
        500,
        "internal_error",
        `Winning node ${team.winningNodeId} for team ${gameTeamId} not found in game nodes`,
      );
    }
    handCompleted = {
      completedAt: team.handCompletedAt!.toISOString(),
      winningTile,
      winningNodeCode: winningNode.code,
      finalHan: team.finalHan,
      finalFu: team.finalFu,
      finalPoints: team.finalPoints,
      finalYaku: team.finalYakuKeys.map((y) => ({ name: y.name, han: y.han })),
    };
  }

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
    // `nextVisibilityChangeAt` advertises the next phase advance to the
    // client (countdown banner). When the phase layer is off there are
    // no `VISIBILITY_PHASE_ADVANCE` jobs at all (scheduler gated in
    // chunk 3), so the lookup would return `null` anyway — we still
    // explicitly short-circuit so a phase-off game that somehow has a
    // stale job lying around (manual seeding, mode flip mid-flight)
    // doesn't surface a countdown the client can't act on.
    nextVisibilityChangeAt: phaseLayerActive
      ? nextVisibilityJob?.runAt.toISOString() ?? null
      : null,
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
    handCompleted,
    teamsCompleted,
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

function buildAtStation(params: {
  game: Game;
  teamPosition: GameTeamPosition | null;
  nodes: GameNode[];
  tilesByNodeSlot: Map<string, Map<number, TileDto>>;
  multiSlot: boolean;
  nowMs: number;
  currentChallenge: AtStationChallengeDto | null;
  /**
   * Whether per-slot unlock rules are active (`visibility_mode`
   * includes `slot`). When false, every slot at the station is
   * exposed to the checked-in team regardless of the
   * `slot_unlock_offsets_seconds` snapshot.
   */
  slotLayerActive: boolean;
}): AtStationDto | null {
  const {
    game,
    teamPosition,
    nodes,
    tilesByNodeSlot,
    multiSlot,
    nowMs,
    currentChallenge,
    slotLayerActive,
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
    // Slot-off games treat every slot index as unlocked at the
    // station; otherwise we defer to the wall-clock helper that
    // reads `game.slot_unlock_offsets_seconds`.
    const unlocked = slotLayerActive
      ? unlockedSlotIndices(game, game.slotsPerNode, nowMs)
      : Array.from({ length: game.slotsPerNode }, (_v, k) => k);
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
