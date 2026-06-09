import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameEvent } from "../models/game-event.ts";
import { GameNode } from "../models/game-node.ts";
import { GameRuleFlag } from "../models/game-rule-flag.ts";
import { GameTeam } from "../models/game-team.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import {
  type AnalyzedWait,
  type DoraIndicator,
  type Tile,
  type WindRank,
  analyzeHand,
} from "../scoring/index.ts";
import { teamCodeToWindRank } from "../scoring/seat-wind.ts";
import {
  RED_FIVES_RULE_KEY,
  isRedFiveForGame,
} from "../tiles/red-five.ts";

/**
 * TDD §7 `GET /api/games/:id/summary` — Phase J end-of-game scoreboard.
 *
 * Pure read service: walks the post-`GAME_END` snapshot stamped on
 * `game_teams` (§3.10), augments each row with the team's final 13- or
 * 14-tile hand from `game_tile_placements`, and for non-completed teams
 * runs `analyzeHand` once at request time to surface the tenpai/noten
 * `waits` set. Completed teams' scoring is read straight off the
 * snapshot columns — the endpoint never re-runs the orchestrator on a
 * win (the `CLAIM_WIN`-time evaluation is authoritative).
 *
 * The contract is identical for every caller (post-game scoreboard UI,
 * Discord end-of-game post in Phase K, future replay tooling), so no
 * per-team redaction lives here — `GET /summary` is only available
 * after `games.status = 'ended'`, at which point detailed scoring is
 * public.
 */

export interface SummaryTileDto {
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

export interface SummaryYakuDto {
  name: string;
  han: number;
}

export interface SummaryAnalyzedWaitDto {
  tile: SummaryTileDto;
  han: number;
  fu: number;
  points: number;
  yaku: SummaryYakuDto[];
  isYakuman: boolean;
}

export interface GameSummaryTeamDto {
  gameTeamId: string;
  teamCode: string;
  displayName: string | null;
  /** ISO timestamp the team ran `CLAIM_WIN`; `null` for noten / incomplete. */
  handCompletedAt: string | null;
  /** The 14th tile claimed at `CLAIM_WIN`; `null` for incomplete teams. */
  winningTile: SummaryTileDto | null;
  /** `game_nodes.code` of the station the win was claimed at; `null` for incomplete. */
  winningNodeCode: string | null;
  /** 14 tiles for completed teams (includes the winning tile), 13 otherwise. */
  finalHand: SummaryTileDto[];
  finalHan: number;
  finalFu: number;
  finalPoints: number;
  finalYaku: SummaryYakuDto[];
  isYakuman: boolean;
  /**
   * For incomplete teams: the `analyzeHand` wait set over their 13-tile
   * hand. `null` for completed teams (the win is in `winningTile` /
   * `finalYaku`) and for noten teams whose hand has `shanten > 0`.
   */
  waits: SummaryAnalyzedWaitDto[] | null;
}

export interface GameSummaryDto {
  gameId: string;
  endedAt: string;
  endReason: "timer" | "all_teams_completed";
  /** Strict `finalPoints` leader, or `null` when the game ended tied. */
  winningGameTeamId: string | null;
  teams: GameSummaryTeamDto[];
}

interface HandPlacementRow {
  game_team_id: string;
  game_tile_id: string;
  copy_index: number;
  suit: string;
  rank: number;
  suit_sort_order: number;
  display_name: string;
}

interface DoraIndicatorRow {
  suit: string;
  rank: number;
}

interface GameEndedPayload {
  endedAt?: unknown;
  endReason?: unknown;
  winningGameTeamId?: unknown;
}

function isValidEndReason(
  value: unknown,
): value is "timer" | "all_teams_completed" {
  return value === "timer" || value === "all_teams_completed";
}

export async function buildGameSummary(
  gameId: string,
): Promise<GameSummaryDto> {
  const game = await Game.findByPk(gameId);
  if (!game) {
    throw new HttpError(404, "not_found", `Game not found: ${gameId}`);
  }
  if (game.status !== "ended") {
    throw new HttpError(
      409,
      "game_not_ended",
      `Game ${gameId} has not ended yet (status: ${game.status})`,
    );
  }

  // The `GAME_ENDED` event payload is the canonical source for
  // `endedAt / endReason / winningGameTeamId` — the `games` table only
  // tracks `status` and the original `endsAt` timer (which may differ
  // from the actual end time when the all-teams-completed early-end
  // path fires).
  const gameEndedEvent = await GameEvent.findOne({
    where: { gameId, eventType: "GAME_ENDED" },
    order: [["sequence", "DESC"]],
  });
  if (!gameEndedEvent) {
    throw new HttpError(
      500,
      "internal_error",
      `Game ${gameId} is ended but has no GAME_ENDED event`,
    );
  }
  const payload = (gameEndedEvent.payload ?? {}) as GameEndedPayload;
  const endedAt =
    typeof payload.endedAt === "string"
      ? payload.endedAt
      : gameEndedEvent.createdAt.toISOString();
  const endReason = isValidEndReason(payload.endReason)
    ? payload.endReason
    : "timer";
  const winningGameTeamId =
    typeof payload.winningGameTeamId === "string"
      ? payload.winningGameTeamId
      : null;

  const [teams, redFivesFlag, nodes, placementRows, doraRows] =
    await Promise.all([
      GameTeam.findAll({
        where: { gameId },
        include: [TeamDefinition],
      }),
      GameRuleFlag.findOne({
        where: { gameId, ruleKey: RED_FIVES_RULE_KEY },
      }),
      GameNode.findAll({ where: { gameId } }),
      sequelize.query<HandPlacementRow>(
        `SELECT p.game_team_id      AS game_team_id,
                t.id                AS game_tile_id,
                t.copy_index        AS copy_index,
                tt.suit             AS suit,
                tt.rank             AS rank,
                tt.suit_sort_order  AS suit_sort_order,
                tt.display_name     AS display_name
           FROM game_tile_placements p
           INNER JOIN game_tiles t  ON t.id = p.game_tile_id
           INNER JOIN tile_types tt ON tt.id = t.tile_type_id
          WHERE t.game_id = :gameId
            AND p.game_team_id IS NOT NULL
            AND p.slot_index IS NULL
            AND p.game_node_id IS NULL`,
        { replacements: { gameId }, type: QueryTypes.SELECT },
      ),
      sequelize.query<DoraIndicatorRow>(
        `SELECT tt.suit, tt.rank
           FROM game_tile_placements p
           INNER JOIN game_tiles t  ON t.id = p.game_tile_id
           INNER JOIN tile_types tt ON tt.id = t.tile_type_id
          WHERE t.game_id = :gameId
            AND p.dead_wall_index = 0
          LIMIT 1`,
        { replacements: { gameId }, type: QueryTypes.SELECT },
      ),
    ]);

  const redFivesEnabled = redFivesFlag?.enabled ?? false;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const doraIndicator: DoraIndicator | null = doraRows[0]
    ? {
        suit: doraRows[0].suit as DoraIndicator["suit"],
        rank: doraRows[0].rank,
      }
    : null;
  const doraIndicators: DoraIndicator[] = doraIndicator
    ? [doraIndicator]
    : [];

  // Hand rows grouped by `game_team_id` and pre-sorted by
  // `(suit_sort_order, rank, copy_index)` — same key §3.7 specifies for
  // every hand presentation.
  const handsByTeam = new Map<string, HandPlacementRow[]>();
  for (const row of placementRows) {
    const list = handsByTeam.get(row.game_team_id) ?? [];
    list.push(row);
    handsByTeam.set(row.game_team_id, list);
  }
  for (const rows of handsByTeam.values()) {
    rows.sort(handRowComparator);
  }

  // Side-index every hand tile by `(suit, rank, copyIndex)` so a wait
  // tile (produced by `analyzeHand` for incomplete teams) can be
  // backfilled with the matching `displayName` / `isRedFive` flags
  // without an extra round trip. We index across every team's hand —
  // each `(suit, rank, copyIndex)` triple is unique in the 136-tile
  // catalog so collisions only happen between teams that own different
  // copies of the same tile-type, which is the desired aliasing.
  const tileByKey = new Map<string, HandPlacementRow>();
  for (const row of placementRows) {
    const key = tileKey(row.suit, row.rank, row.copy_index);
    if (!tileByKey.has(key)) {
      tileByKey.set(key, row);
    }
  }

  // Sort teams by `TeamDefinition.sortOrder` ASC so the response is
  // deterministic (east, south, west, north). The `findAll` above does
  // not order by the include because Sequelize requires a nested order
  // clause; we sort post-query for clarity.
  const sortedTeams = [...teams].sort(
    (a, b) =>
      (a.teamDefinition?.sortOrder ?? 0) -
      (b.teamDefinition?.sortOrder ?? 0),
  );

  const teamDtos: GameSummaryTeamDto[] = sortedTeams.map((team) =>
    buildTeamSummary({
      team,
      handRows: handsByTeam.get(team.id) ?? [],
      nodesById,
      tileByKey,
      redFivesEnabled,
      doraIndicators,
      roundWind: game.roundWind as WindRank,
    }),
  );

  return {
    gameId,
    endedAt,
    endReason,
    winningGameTeamId,
    teams: teamDtos,
  };
}

function tileKey(suit: string, rank: number, copyIndex: number): string {
  return `${suit}|${rank}|${copyIndex}`;
}

function handRowComparator(
  a: HandPlacementRow,
  b: HandPlacementRow,
): number {
  if (a.suit_sort_order !== b.suit_sort_order) {
    return a.suit_sort_order - b.suit_sort_order;
  }
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.copy_index - b.copy_index;
}

function rowToTileDto(
  row: HandPlacementRow,
  redFivesEnabled: boolean,
): SummaryTileDto {
  return {
    instanceId: row.game_tile_id,
    suit: row.suit,
    rank: row.rank,
    copyIndex: row.copy_index,
    displayName: row.display_name,
    isRedFive: isRedFiveForGame(
      {
        suit: row.suit,
        rank: row.rank,
        copyIndex: row.copy_index,
      },
      redFivesEnabled,
    ),
  };
}

function buildTeamSummary(params: {
  team: GameTeam;
  handRows: HandPlacementRow[];
  nodesById: Map<string, GameNode>;
  tileByKey: Map<string, HandPlacementRow>;
  redFivesEnabled: boolean;
  doraIndicators: DoraIndicator[];
  roundWind: WindRank;
}): GameSummaryTeamDto {
  const {
    team,
    handRows,
    nodesById,
    tileByKey,
    redFivesEnabled,
    doraIndicators,
    roundWind,
  } = params;

  const teamCode = team.teamDefinition?.code;
  if (!teamCode) {
    // Every game team has a `team_definition_id` FK by schema; an
    // absent code means the include silently dropped. Fail loud so the
    // caller sees a 500 rather than a synthetic empty-string code.
    throw new HttpError(
      500,
      "internal_error",
      `Game team ${team.id} missing team_definition.code`,
    );
  }
  const seatWind = teamCodeToWindRank(teamCode);
  if (seatWind === null) {
    throw new HttpError(
      500,
      "internal_error",
      `Cannot derive seat wind for team ${team.id} (code: ${teamCode})`,
    );
  }

  const finalHand: SummaryTileDto[] = handRows.map((row) =>
    rowToTileDto(row, redFivesEnabled),
  );

  let winningTile: SummaryTileDto | null = null;
  let winningNodeCode: string | null = null;
  if (team.winningTileId != null) {
    const found = handRows.find((row) => row.game_tile_id === team.winningTileId);
    winningTile = found ? rowToTileDto(found, redFivesEnabled) : null;
  }
  if (team.winningNodeId != null) {
    const node = nodesById.get(team.winningNodeId);
    winningNodeCode = node?.code ?? null;
  }

  const finalHan = team.finalHan ?? 0;
  const finalFu = team.finalFu ?? 0;
  const finalPoints = team.finalPoints ?? 0;
  const finalYaku: SummaryYakuDto[] = (team.finalYakuKeys ?? []).map((y) => ({
    name: y.name,
    han: y.han,
  }));
  // `fu === 0 && han > 0` is the canonical yakuman shape (orchestrator
  // §3.9: yakuman ignores red-five + dora bonuses, fu is 0; a normal
  // win always rounds fu to at least 20). The noten / incomplete path
  // has both fields 0, which correctly produces `isYakuman = false`.
  const isYakuman = finalFu === 0 && finalHan > 0;

  // For completed teams: scoring snapshot is authoritative; we do not
  // re-run analyzeHand. The `waits` field is `null` (winningTile + the
  // 14-tile hand carry the same info).
  if (team.handCompletedAt != null) {
    return {
      gameTeamId: team.id,
      teamCode,
      displayName: team.displayName,
      handCompletedAt: team.handCompletedAt.toISOString(),
      winningTile,
      winningNodeCode,
      finalHand,
      finalHan,
      finalFu,
      finalPoints,
      finalYaku,
      isYakuman,
      waits: null,
    };
  }

  // Incomplete team: run analyzeHand once over the 13-tile hand at
  // request time per TDD §7. The orchestrator skips when the hand has
  // a non-standard size — we treat that as `waits: null` (the column
  // shape can't produce a meaningful wait set without 13 tiles).
  let waits: SummaryAnalyzedWaitDto[] | null = null;
  if (finalHand.length === 13) {
    const tiles: Tile[] = finalHand.map((t) => ({
      suit: t.suit,
      rank: t.rank,
      copyIndex: t.copyIndex,
    }));
    const analysis = analyzeHand({
      tiles,
      seatWind,
      roundWind,
      redFivesEnabled,
      doraIndicators,
    });
    if (analysis.shanten === 0 && analysis.waits) {
      waits = analysis.waits.map((wait) =>
        waitToDto(wait, tileByKey, redFivesEnabled),
      );
    }
  }

  return {
    gameTeamId: team.id,
    teamCode,
    displayName: team.displayName,
    handCompletedAt: null,
    winningTile: null,
    winningNodeCode: null,
    finalHand,
    finalHan,
    finalFu,
    finalPoints,
    finalYaku,
    isYakuman,
    waits,
  };
}

function waitToDto(
  wait: AnalyzedWait,
  tileByKey: Map<string, HandPlacementRow>,
  redFivesEnabled: boolean,
): SummaryAnalyzedWaitDto {
  const key = tileKey(wait.tile.suit, wait.tile.rank, wait.tile.copyIndex);
  const match = tileByKey.get(key);
  const tile: SummaryTileDto = match
    ? rowToTileDto(match, redFivesEnabled)
    : {
        // No game_tile instance matched the wait — the orchestrator's
        // copyIndex preference (red-five-first) may pick a tile that
        // isn't currently in any team's hand. Fall back to a synthetic
        // shape: `instanceId` is empty (signalling "no concrete
        // placement"), `displayName` reconstructed from the canonical
        // form; isRedFive is derived from the rule flag.
        instanceId: "",
        suit: wait.tile.suit,
        rank: wait.tile.rank,
        copyIndex: wait.tile.copyIndex,
        displayName: synthesizeDisplayName(wait.tile),
        isRedFive: isRedFiveForGame(wait.tile, redFivesEnabled),
      };
  return {
    tile,
    han: wait.han,
    fu: wait.fu,
    points: wait.points,
    yaku: wait.yaku.map((y) => ({ name: y.name, han: y.han })),
    isYakuman: wait.isYakuman,
  };
}

const WIND_NAMES: Record<number, string> = {
  1: "East",
  2: "South",
  3: "West",
  4: "North",
};
const DRAGON_NAMES: Record<number, string> = {
  1: "Red",
  2: "White",
  3: "Green",
};

/**
 * Defensive synthesis for waits whose `(suit, rank, copyIndex)` doesn't
 * match any current game-tile placement (e.g. the wait tile is sitting
 * in the dead wall, or already at a node slot we didn't load). Mirrors
 * the seed names in `seeders/20260517191000-seed-tile-types.cjs` so the
 * client can render the wait without an extra catalog round trip.
 */
function synthesizeDisplayName(tile: Tile): string {
  const isRedFiveCandidate =
    tile.rank === 5 &&
    (tile.suit === "man" || tile.suit === "pin" || tile.suit === "sou") &&
    tile.copyIndex === 0;
  switch (tile.suit) {
    case "man":
      return isRedFiveCandidate ? "Red 5 Man" : `${tile.rank} Man`;
    case "pin":
      return isRedFiveCandidate ? "Red 5 Pin" : `${tile.rank} Pin`;
    case "sou":
      return isRedFiveCandidate ? "Red 5 Sou" : `${tile.rank} Sou`;
    case "wind":
      return `${WIND_NAMES[tile.rank] ?? tile.rank} Wind`;
    case "dragon":
      return `${DRAGON_NAMES[tile.rank] ?? tile.rank} Dragon`;
    default:
      return `${tile.suit} ${tile.rank}`;
  }
}
