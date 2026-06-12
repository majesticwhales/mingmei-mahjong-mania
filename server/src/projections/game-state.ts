import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import { visibilityIncludes } from "../game/visibility-mode.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game, type GameStatus } from "../models/game.ts";
import { GameEdge } from "../models/game-edge.ts";
import { GameLine } from "../models/game-line.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNode } from "../models/game-node.ts";
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
import { pickCurrentChallengeForTeam } from "../services/challenge-queue.ts";
import {
  isSlotUnlocked,
  mapUnlockedSlotIndices,
  phaseDrivenMapVisibleSlotIndices,
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
 * claim-unlock, and slot map-unlock rules to user-facing tile data.
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

/**
 * Phase L §3.13: exhaustive per-slot map view, server-resolved. Every
 * slot the node has (`0 .. slots_per_node - 1`) appears in
 * `MapNodeDto.tiles[]`, in ascending order. The pre-Phase-L "omit hidden
 * slots" pattern is gone — the client renders by reading these flags
 * directly rather than re-deriving visibility from phase / slot math.
 *
 * - `tile` is present iff `visible: true` AND a tile occupies the slot;
 *   `null` otherwise (hidden slot, or empty slot with no placement).
 * - `visible` is true iff `faceUpOnMap(team, node)` is true AND the
 *   slot's map-reveal timer has elapsed
 *   (`slot_map_unlock_offsets_seconds[slotIndex]` is non-`NULL` and
 *   `now >= started_at + offset * 1000`). Mode-off layers
 *   short-circuit to true (see [§3.13](docs/TDD_server.md#313-server-authoritative-tile-visibility)).
 * - `locked` is true iff the slot's claim-unlock timer has not yet
 *   elapsed (`now < started_at + slot_unlock_offsets_seconds[slotIndex] * 1000`).
 *   The DB constraint `mapOffset[k] IS NULL OR mapOffset[k] >= claimOffset[k]`
 *   means `visible: true` implies `locked: false`; `locked` is mostly
 *   useful when `visible: false` so the client can render a
 *   "claim opens in X" countdown without re-deriving the math.
 */
export interface MapNodeTileDto {
  slotIndex: number;
  tile: TileDto | null;
  visible: boolean;
  locked: boolean;
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
  /**
   * Phase L §3.13: exhaustive per-slot view. `tiles.length` always
   * equals `slots_per_node`. UI rendering paths must read
   * `tiles[].visible` / `tiles[].locked` directly — never re-derive from
   * `visibilityPhase` / `phaseDrivenSlotMap` (those survive only as
   * telemetry, see `GameStateProjection`).
   */
  tiles: MapNodeTileDto[];
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
  /**
   * Optional illustration URL. Free-text TEXT from `challenges.image_url`;
   * the client renders it inside `ChallengeModal` when present. Typically
   * an absolute path served by the client static bundle (e.g.
   * `/challenges/bay.png` from `client/public/challenges/`), but external
   * URLs are accepted verbatim. `null` when the challenge has no
   * illustration.
   */
  imageUrl: string | null;
  status: "available" | "in_progress" | "cooldown";
  /** Present when `status === "in_progress"`. */
  instanceId?: string;
  /** Present when `status === "cooldown"`. */
  cooldownUntil?: string;
}

export interface AtStationDto {
  nodeId: string;
  code: string;
  /**
   * Phase L §3.13: exhaustive per-slot view, byte-identical to the
   * matching `mapNodes[].tiles[]` entry for the team's current node.
   * `tiles.length` always equals `slots_per_node`. The pre-Phase-L
   * conditional `tile` / `tiles?` shape is gone — UI rendering paths
   * now read `tiles[].visible` / `tiles[].locked` / `tiles[].tile`
   * directly. See `MapNodeTileDto` for the per-entry contract.
   */
  tiles: MapNodeTileDto[];
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
   * client uses this for the visibility-countdown banner.
   */
  nextVisibilityChangeAt: string | null;
  /**
   * **Telemetry only as of Phase L §3.13.** Current visibility phase
   * index `[0, visibilityPhaseCount)`. Surfaces "phase k of n" copy in
   * the `VisibilityCountdown` component and event log; UI rendering
   * paths must read `mapNodes[].tiles[].visible` directly rather than
   * re-deriving per-slot visibility from this field.
   */
  visibilityPhase: number;
  /**
   * **Telemetry only as of Phase L §3.13.** Snapshotted phase count;
   * equals `slotsPerNode` in the tile-slot mode. Surfaces "phase k of n"
   * copy; see `visibilityPhase` for why UI paths must not consume it.
   */
  visibilityPhaseCount: number;
  /**
   * **Telemetry only as of Phase L §3.13** — UI rendering paths must
   * read `mapNodes[].tiles[].visible` directly. Retained so
   * `VisibilityCountdown` and event-log copy can still render
   * "phase k of n" text. When true (`visibility_mode` includes `phase`
   * and `visibilityPhaseCount === slotsPerNode`) the projection's
   * per-slot visibility math used a phase-driven path; the client must
   * not re-derive that decision.
   */
  phaseDrivenSlotMap: boolean;
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

  const phaseDrivenSlotMap =
    phaseLayerActive &&
    phaseDrivenMapVisibleSlotIndices(
      0,
      slotsPerNode,
      game.visibilityPhaseCount,
    ) != null;
  const mapVisibleSlots = resolveMapVisibleSlotIndices({
    game,
    slotsPerNode,
    phaseLayerActive,
    slotLayerActive,
    nowMs,
  });

  // Phase L §3.13: per-slot map-reveal set, as a Set for O(1) lookup
  // inside the per-node loop below. Identical for every node — the slot
  // tier is uniform across the map.
  const mapVisibleSlotSet = new Set(mapVisibleSlots);

  const mapNodes: MapNodeDto[] = nodes.map((node) => {
    // When the phase layer is off, every node is treated as face-up
    // — the team's `game_location_team_visibility` rows are absent
    // because `bootstrapGameVisibility` was skipped at start, so we
    // bypass the gate entirely rather than checking the empty set.
    const nodeFaceUp = !phaseLayerActive || faceUpNodeIds.has(node.id);
    const bySlot = tilesByNodeSlot.get(node.id);

    // Phase L §3.13: every slot the node has appears in `tiles[]`, in
    // ascending order. `tile` is null when the slot is hidden, empty,
    // or both. `visible` folds phase fog + per-slot map-reveal timer;
    // `locked` mirrors the claim-unlock timer (independent of visible).
    const tiles: MapNodeTileDto[] = [];
    for (let slotIndex = 0; slotIndex < slotsPerNode; slotIndex += 1) {
      const visible = nodeFaceUp && mapVisibleSlotSet.has(slotIndex);
      const locked = slotLayerActive && !isSlotUnlocked(game, slotIndex, nowMs);
      const placement = bySlot?.get(slotIndex) ?? null;
      tiles.push({
        slotIndex,
        tile: visible ? placement : null,
        visible,
        locked,
      });
    }

    return {
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
      tiles,
    };
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

  // Phase L §3.13 + tier spec (TDD §3.3): `atStation.tiles[]` shares
  // the per-slot shape with `mapNodes[teamNode].tiles[]` but applies
  // an *at-station privilege* on top of the map gates — a slot whose
  // claim-unlock timer has elapsed becomes station-visible even when
  // the map-reveal timer hasn't. Tier 2 (claim=0, map>0) renders at
  // the station from t=0; Tier 3 (claim>0, map=claim+δ) joins as soon
  // as the claim timer fires. The map view (`mapNodes[].tiles[]`)
  // keeps the stricter `mapVisible` gate so the fog-of-war stays
  // intact for everyone else (including the team browsing other
  // stations).
  const teamNodeId = teamPosition?.currentGameNodeId ?? null;
  const teamMapNode = teamNodeId
    ? mapNodes.find((n) => n.id === teamNodeId) ?? null
    : null;
  const atStationTiles: MapNodeTileDto[] | null =
    teamNodeId && teamMapNode
      ? buildAtStationTiles({
        game,
        teamNodeId,
        slotsPerNode,
        nowMs,
        slotLayerActive,
        mapVisibleSlotSet,
        tilesByNodeSlot,
      })
      : null;
  const atStation = handCompletedFlag
    ? null
    : buildAtStation({
      teamPosition,
      teamNode: teamMapNode,
      atStationTiles,
      currentChallenge,
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
    visibilityPhase: game.visibilityPhase,
    visibilityPhaseCount: game.visibilityPhaseCount,
    phaseDrivenSlotMap,
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

function resolveMapVisibleSlotIndices(params: {
  game: Game;
  slotsPerNode: number;
  phaseLayerActive: boolean;
  slotLayerActive: boolean;
  nowMs: number;
}): number[] {
  const { game, slotsPerNode, phaseLayerActive, slotLayerActive, nowMs } =
    params;

  if (game.status === "ended") {
    return Array.from({ length: slotsPerNode }, (_v, k) => k);
  }

  const phaseDrivenSlots = phaseLayerActive
    ? phaseDrivenMapVisibleSlotIndices(
      game.visibilityPhase,
      slotsPerNode,
      game.visibilityPhaseCount,
    )
    : null;
  if (phaseDrivenSlots != null) {
    return phaseDrivenSlots;
  }

  if (!slotLayerActive) {
    return Array.from({ length: slotsPerNode }, (_v, k) => k);
  }

  // Phase L: `slot_map_unlock_offsets_seconds[k]` carries both "ever
  // on the map?" (`null` = never — the "out of play on map" tier) and
  // "when?" (non-negative offset in seconds from `started_at`). See
  // migration `20260611120000-add-slot-map-unlock-offsets.cjs`.
  return mapUnlockedSlotIndices(game, slotsPerNode, nowMs);
}

function buildAtStation(params: {
  teamPosition: GameTeamPosition | null;
  teamNode: MapNodeDto | null;
  atStationTiles: MapNodeTileDto[] | null;
  currentChallenge: AtStationChallengeDto | null;
}): AtStationDto | null {
  const { teamPosition, teamNode, atStationTiles, currentChallenge } = params;
  if (!teamPosition?.currentGameNodeId || !teamNode || !atStationTiles) {
    return null;
  }
  // `atStationTiles` is the at-station-privileged view computed at the
  // projection scope (see [`buildAtStationTiles`](#) below).
  // `MapNodeTileDto[]` shape is identical to `mapNodes[].tiles[]`, but
  // the `visible` flag is loosened so claim-unlocked slots reveal at
  // the station even before their map-reveal timer fires.
  return {
    nodeId: teamNode.id,
    code: teamNode.code,
    tiles: atStationTiles,
    currentChallenge,
    pendingSwapCredit: teamPosition.pendingSwapCredit,
    creditEarnedInSession: teamPosition.creditEarnedInSession,
  };
}

/**
 * Per-slot tile shape for the team's current station. Mirrors the
 * `mapNodes[teamNode].tiles[]` loop in `buildGameStateProjection` but
 * applies the **at-station privilege**, which is two cooperating
 * relaxations of the map rule:
 *
 *   1. **Visit-based node reveal** (TDD §3.3): checking in at a node
 *      makes that node face-up to the team regardless of phase fog —
 *      `faceUpForTeam(team, N) = true even if phase would hide N`.
 *      The persistent `game_location_team_visibility` row may or may
 *      not exist (phase advances + check-in both write it, depending
 *      on flow); the station view doesn't care. `nodeFaceUp = true`
 *      unconditionally here because this function is only ever called
 *      for the team's currently-checked-in node.
 *   2. **Claim-unlocked slot reveal** (TDD §3.3 Tier 2/3 spec): a slot
 *      whose claim-unlock timer has elapsed is station-visible even
 *      when the map-reveal timer has not. The map view stays strict
 *      (`visible = nodeFaceUp && mapVisibleSlot`); the station view
 *      relaxes to `visible = mapVisibleSlot || !locked` (with
 *      `nodeFaceUp` already pinned to true by relaxation #1).
 *
 * Mode interactions:
 *   - **phase-only** (slot layer off): `locked === false` everywhere,
 *     so every slot at the station is visible. The map view still
 *     respects phase fog for non-checked-in nodes.
 *   - **slot-only** (phase layer off): `phaseLayerActive === false` so
 *     `nodeFaceUp` is trivially true on the map too — no node-level
 *     relaxation needed. Station view exposes any claim-unlocked slot;
 *     map view still respects `slot_map_unlock_offsets_seconds`.
 *   - **both layers on**: most expressive. The team's current node is
 *     always face-up at the station; Tier 2 (claim=0, map>0) surfaces
 *     at t=0; Tier 3 (claim>0) waits for the claim timer.
 *   - **none**: everything visible everywhere.
 */
function buildAtStationTiles(params: {
  game: Game;
  teamNodeId: string;
  slotsPerNode: number;
  nowMs: number;
  slotLayerActive: boolean;
  mapVisibleSlotSet: Set<number>;
  tilesByNodeSlot: Map<string, Map<number, TileDto>>;
}): MapNodeTileDto[] {
  const {
    game,
    teamNodeId,
    slotsPerNode,
    nowMs,
    slotLayerActive,
    mapVisibleSlotSet,
    tilesByNodeSlot,
  } = params;
  // Relaxation #1: visit-based node reveal — see JSDoc above.
  const nodeFaceUp = true;
  const bySlot = tilesByNodeSlot.get(teamNodeId);
  const tiles: MapNodeTileDto[] = [];
  for (let slotIndex = 0; slotIndex < slotsPerNode; slotIndex += 1) {
    const mapVisibleSlot = mapVisibleSlotSet.has(slotIndex);
    const locked = slotLayerActive && !isSlotUnlocked(game, slotIndex, nowMs);
    // Relaxation #2: claim-unlocked OR map-revealed → visible.
    const visible = nodeFaceUp && (mapVisibleSlot || !locked);
    const placement = bySlot?.get(slotIndex) ?? null;
    tiles.push({
      slotIndex,
      tile: visible ? placement : null,
      visible,
      locked,
    });
  }
  return tiles;
}

/**
 * Resolve the team's current challenge at a station plus the team's
 * relationship with it (TDD §3.8). Row selection is delegated to
 * `pickCurrentChallengeForTeam` so the per-team cycle rule
 * (`failed` / `in_progress` pin, `completed` advance, wrap) stays in
 * one place — the projection here and the `START_CHALLENGE` handler
 * resolve the same row for the same team.
 *
 * Two queries in the common case, three after a `completed` advance —
 * the helper handles that. The status decoding below mirrors the
 * three observable states surfaced to the client.
 *
 * Returns `null` when the station has no challenges configured (the
 * back-compat path). Pure read — never mutates state. Exported so the
 * Phase L `buildNodeView` helper ([§3.14](../docs/TDD_server.md#314-node-view-endpoint))
 * emits the same per-team challenge shape `atStation` does — the two
 * surfaces share a single source of truth.
 */
export async function buildCurrentChallenge(params: {
  gameNodeId: string;
  gameTeamId: string;
  nowMs: number;
}): Promise<AtStationChallengeDto | null> {
  const { gameNodeId, gameTeamId, nowMs } = params;

  const picked = await pickCurrentChallengeForTeam({
    gameNodeId,
    gameTeamId,
    includeChallenge: true,
  });
  if (!picked || !picked.row.challenge) {
    return null;
  }
  const { row: topRow, latestInstanceForRow: latestInstance } = picked;

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
    imageUrl: topRow.challenge.imageUrl,
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
