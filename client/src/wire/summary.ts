// SERVER SOURCE: server/src/services/game-summary-service.ts

import type { FinalYakuDto } from "./projection";

/**
 * Phase J — `GET /api/games/:id/summary` (TDD §3.10, §7).
 *
 * Mirrors `GameSummaryDto` on the server. The shape is identical for
 * every caller (post-game scoreboard, future Discord bot post) — no
 * per-team redaction at this surface; the endpoint is only available
 * after `games.status = 'ended'`, at which point all scoring is public.
 */

export interface SummaryTileDto {
  /**
   * `game_tiles.id` of the matching placement when one exists in the
   * game. Empty string for synthetic wait tiles whose `(suit, rank,
   * copyIndex)` doesn't match any current placement.
   */
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

export interface SummaryAnalyzedWaitDto {
  tile: SummaryTileDto;
  han: number;
  fu: number;
  points: number;
  yaku: FinalYakuDto[];
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
  finalYaku: FinalYakuDto[];
  isYakuman: boolean;
  /** Tenpai wait set for noten teams; `null` for completed / non-tenpai. */
  waits: SummaryAnalyzedWaitDto[] | null;
}

export interface GameSummaryDto {
  gameId: string;
  endedAt: string;
  /**
   * Server precedence: `all_teams_completed` (every team claimed) wins
   * over the trigger; otherwise `manual` for admin-driven early ends and
   * `timer` for the scheduler tick at the configured end time.
   */
  endReason: "timer" | "all_teams_completed" | "manual";
  /** Strict `finalPoints` leader; `null` on ties or no-winner. */
  winningGameTeamId: string | null;
  teams: GameSummaryTeamDto[];
}
