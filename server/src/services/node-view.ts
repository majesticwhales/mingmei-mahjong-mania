/**
 * `GET /api/games/:id/nodes/:nodeId/view` backing helper
 * ([TDD §3.14](../../../docs/TDD_server.md#314-node-view-endpoint)).
 *
 * Single source of truth for the StationPanel's data: per-slot tile
 * visibility / lock state (byte-identical to `MapNodeDto.tiles[]` for
 * the same node + team + clock — both surfaces call into the same
 * `slot-visibility` helpers and consume the same DB rows), the top
 * `currentChallenge` for the team (via the projection's exported
 * `buildCurrentChallenge`), and an exhaustive `availableActions[]`
 * matrix with stable disable-reason codes so the client can render
 * tooltips without re-deriving engine rules.
 *
 * The helper is read-only (no mutations) and accepts an optional
 * `Transaction` so it can run inside a route handler's tx if one is
 * needed later. It loads only the data for the requested node — no
 * fan-out over the full map — which keeps the per-call cost bounded
 * even when polled.
 *
 * Errors:
 *   - `404 game_not_found` — `games.id` not present.
 *   - `409 game_not_started` — game row exists but `started_at` null.
 *   - `409 game_ended` — game terminal (`status === "ended"`); during
 *     the `"ending"` drain window the helper still returns data, and
 *     `availableActions[]` flips every action to disabled with reason
 *     `game_ended` so the client can render a snapshot.
 *   - `404 team_not_in_game` — `gameTeamId` is not a team in `gameId`
 *     (route layer is expected to translate the requester's id to the
 *     team via `game_participants` first; this helper bypasses that
 *     translation and trusts the caller).
 *   - `404 node_not_found` — `gameNodeId` is not a node in `gameId`.
 */

import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { visibilityIncludes } from "../game/visibility-mode.ts";
import { Game } from "../models/game.ts";
import { GameChallengeInstance } from "../models/game-challenge-instance.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";
import { GameRuleFlag } from "../models/game-rule-flag.ts";
import { GameTeam } from "../models/game-team.ts";
import { GameTeamPosition } from "../models/game-team-position.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import {
  buildCurrentChallenge,
  type AtStationChallengeDto,
  type MapNodeTileDto,
  type TileDto,
} from "../projections/game-state.ts";
import {
  analyzeHand,
  type AnalyzedWait,
  type DoraIndicator,
  type WindRank,
} from "../scoring/index.ts";
import { teamCodeToWindRank } from "../scoring/seat-wind.ts";
import { loadTeamHandTiles } from "../engine/team-hand-tiles.ts";
import {
  isSlotMapUnlocked,
  isSlotUnlocked,
} from "./slot-visibility.ts";
import {
  isRedFiveForGame,
  RED_FIVES_RULE_KEY,
} from "../tiles/red-five.ts";

/**
 * Per-slot tile shape returned by `GET /api/games/:id/nodes/:nodeId/view`.
 * Alias for `MapNodeTileDto` ([§3.13](../../../docs/TDD_server.md#313-server-authoritative-tile-visibility))
 * because the two surfaces are required to emit byte-identical rows for
 * the same node + team + clock — the alias documents the relationship
 * at the wire-name level without introducing a second drift target.
 */
export type NodeViewTileDto = MapNodeTileDto;

/**
 * Every command the StationPanel might surface. Keep the union in sync
 * with the engine handlers under `server/src/engine/handlers/`; adding
 * a new command requires growing this union, the reason enum below, and
 * the action-computation branch in `computeAvailableActions`.
 */
export type AvailableActionType =
  | "check_in"
  | "check_out"
  | "swap_tile"
  | "swap_location_tiles"
  | "start_challenge"
  | "claim_win";

/**
 * Stable disable-reason codes ([§3.14](../../../docs/TDD_server.md#314-node-view-endpoint)).
 * The client renders these via a lookup table on the StationPanel —
 * adding a new code requires a corresponding client-side string. Code
 * names mirror the engine handlers' `409` error codes so cross-referencing
 * a disabled action with the rejected command is straightforward.
 */
export type AvailableActionReason =
  | "not_checked_in"
  | "wrong_node"
  | "slot_locked"
  | "hand_completed"
  | "swap_credit_required"
  | "credit_already_used"
  | "challenge_in_progress"
  | "challenge_on_cooldown"
  | "no_challenge_at_station"
  | "no_winning_wait"
  | "not_tenpai"
  | "game_ended";

export interface AvailableActionDto {
  action: AvailableActionType;
  enabled: boolean;
  /**
   * Present iff `enabled === false`. Encodes the **first** failing
   * precondition (handlers stop on the first rejection too), so the
   * client renders one tooltip per disabled action without juggling a
   * priority list.
   */
  reason?: AvailableActionReason;
}

export interface NodeViewDto {
  nodeId: string;
  code: string;
  name: string;
  lineIds: string[];
  isInterchange: boolean;
  tiles: NodeViewTileDto[];
  currentChallenge: AtStationChallengeDto | null;
  availableActions: AvailableActionDto[];
}

export interface BuildNodeViewParams {
  gameId: string;
  gameTeamId: string;
  nodeId: string;
  /**
   * Wall-clock for the visibility / lock derivation. Defaults to
   * `Date.now()`; pass an explicit value from tests / replay paths so
   * the per-slot timer comparison stays deterministic.
   */
  nowMs?: number;
  /**
   * Optional read-transaction. Route handlers don't need one (read-only,
   * no consistency requirement across requests); the parameter exists
   * so a future caller (e.g. an event handler that wants a node-view
   * snapshot at command-commit time) can chain into an in-flight tx.
   */
  transaction?: Transaction;
}

export async function buildNodeView(
  params: BuildNodeViewParams,
): Promise<NodeViewDto> {
  const { gameId, gameTeamId, nodeId } = params;
  const nowMs = params.nowMs ?? Date.now();
  const transaction = params.transaction;
  const txOption: { transaction?: Transaction } = transaction
    ? { transaction }
    : {};

  const [game, team, node] = await Promise.all([
    Game.findByPk(gameId, txOption),
    GameTeam.findOne({
      where: { id: gameTeamId, gameId },
      include: [TeamDefinition],
      ...txOption,
    }),
    GameNode.findOne({
      where: { id: nodeId, gameId },
      ...txOption,
    }),
  ]);

  if (!game) {
    throw new HttpError(404, "game_not_found", `Game ${gameId} not found`);
  }
  if (!game.startedAt) {
    throw new HttpError(
      409,
      "game_not_started",
      `Game ${gameId} has not started yet`,
    );
  }
  // `"ended"` means the drain has finished and the engine no longer
  // accepts commands — surface a hard reject so the client navigates
  // to the summary screen rather than rendering a stale snapshot.
  // `"ending"` (drain window) falls through to the action matrix below
  // where every command pivots to `enabled: false, reason: "game_ended"`.
  if (game.status === "ended") {
    throw new HttpError(409, "game_ended", `Game ${gameId} has ended`);
  }
  if (!team) {
    throw new HttpError(
      404,
      "team_not_in_game",
      `Team ${gameTeamId} is not part of game ${gameId}`,
    );
  }
  if (!node) {
    throw new HttpError(
      404,
      "node_not_found",
      `Node ${nodeId} is not on game ${gameId}'s map`,
    );
  }

  const [
    position,
    lineRows,
    placementRows,
    visibilityRow,
    challengeCountAtNode,
  ] = await Promise.all([
    GameTeamPosition.findOne({
      where: { gameTeamId },
      ...txOption,
    }),
    sequelize.query<{ code: string; sort_order: number }>(
      `SELECT gl.code, gl.sort_order
         FROM game_node_lines gnl
         INNER JOIN game_lines gl ON gl.id = gnl.game_line_id
        WHERE gnl.game_node_id = :nodeId
        ORDER BY gl.sort_order ASC, gl.code ASC`,
      {
        replacements: { nodeId },
        type: QueryTypes.SELECT,
        ...txOption,
      },
    ),
    sequelize.query<{
      game_tile_id: string;
      slot_index: number;
      suit: string;
      rank: number;
      copy_index: number;
      display_name: string;
    }>(
      `SELECT p.game_tile_id, p.slot_index, tt.suit, tt.rank,
              t.copy_index, tt.display_name
         FROM game_tile_placements p
         INNER JOIN game_tiles t  ON t.id = p.game_tile_id
         INNER JOIN tile_types tt ON tt.id = t.tile_type_id
        WHERE p.game_node_id = :nodeId
          AND p.slot_index IS NOT NULL
        ORDER BY p.slot_index ASC`,
      {
        replacements: { nodeId },
        type: QueryTypes.SELECT,
        ...txOption,
      },
    ),
    GameLocationTeamVisibility.findOne({
      where: { gameTeamId, gameNodeId: nodeId, isFaceUp: true },
      ...txOption,
    }),
    GameNodeChallenge.count({
      where: { gameNodeId: nodeId },
      ...txOption,
    }),
  ]);

  const redFivesFlag = await GameRuleFlag.findOne({
    where: { gameId, ruleKey: RED_FIVES_RULE_KEY },
    ...txOption,
  });
  const redFivesEnabled = redFivesFlag?.enabled ?? false;

  const tilesBySlot = new Map<number, TileDto>();
  for (const row of placementRows) {
    tilesBySlot.set(row.slot_index, {
      instanceId: row.game_tile_id,
      suit: row.suit,
      rank: row.rank,
      copyIndex: row.copy_index,
      displayName: row.display_name,
      isRedFive: isRedFiveForGame(
        { suit: row.suit, rank: row.rank, copyIndex: row.copy_index },
        redFivesEnabled,
      ),
    });
  }

  // Phase L §3.13 parity: same fold the projection's per-node loop runs
  // (`!phaseLayerActive || faceUpNodeIds.has(node.id)`). With only one
  // node in scope we substitute a single `findOne` for the projection's
  // bulk `findAll` — both branches read the same `game_location_team_visibility`
  // rows so the rendered `visible` / `locked` flags must agree.
  const phaseLayerActive = visibilityIncludes(game.visibilityMode, "phase");
  const slotLayerActive = visibilityIncludes(game.visibilityMode, "slot");
  const nodeFaceUp = !phaseLayerActive || visibilityRow != null;
  const tiles: NodeViewTileDto[] = [];
  for (let slotIndex = 0; slotIndex < game.slotsPerNode; slotIndex += 1) {
    const slotMapUnlocked = !slotLayerActive
      || isSlotMapUnlocked(game, slotIndex, nowMs);
    const visible = nodeFaceUp && slotMapUnlocked;
    const locked = slotLayerActive
      && !isSlotUnlocked(game, slotIndex, nowMs);
    const placement = tilesBySlot.get(slotIndex) ?? null;
    tiles.push({
      slotIndex,
      tile: visible ? placement : null,
      visible,
      locked,
    });
  }

  const currentChallenge = await buildCurrentChallenge({
    gameNodeId: nodeId,
    gameTeamId,
    nowMs,
  });

  const availableActions = await computeAvailableActions({
    game,
    team,
    position,
    nodeId,
    node,
    tiles,
    challengeCountAtNode,
    currentChallenge,
    redFivesEnabled,
    nowMs,
    transaction,
  });

  return {
    nodeId: node.id,
    code: node.code,
    name: node.name,
    lineIds: lineRows.map((row) => row.code),
    isInterchange: node.isInterchange,
    tiles,
    currentChallenge,
    availableActions,
  };
}

interface ComputeActionsArgs {
  game: Game;
  team: GameTeam;
  position: GameTeamPosition | null;
  nodeId: string;
  node: GameNode;
  tiles: NodeViewTileDto[];
  challengeCountAtNode: number;
  currentChallenge: AtStationChallengeDto | null;
  redFivesEnabled: boolean;
  nowMs: number;
  transaction?: Transaction;
}

/**
 * Action-reason matrix for `availableActions[]`. Each branch mirrors
 * the **first** failing precondition the corresponding engine handler
 * would reject on so a disabled action's `reason` matches what a stale
 * client would see on submit. Action ordering matches the StationPanel
 * render order (check_in / check_out before swaps, swaps before
 * challenges, claim last) — purely for readability of the JSON; the
 * client keys off `action`, not array index.
 */
async function computeAvailableActions(
  args: ComputeActionsArgs,
): Promise<AvailableActionDto[]> {
  const {
    game,
    team,
    position,
    nodeId,
    challengeCountAtNode,
    tiles,
  } = args;
  const out: AvailableActionDto[] = [];

  const atThisNode = position?.currentGameNodeId === nodeId;
  const atDifferentNode =
    position?.currentGameNodeId != null
    && position.currentGameNodeId !== nodeId;
  const handCompleted = team.handCompletedAt != null;
  // `"ending"` collapses the engine to a drain-only state — no new
  // commands are accepted — so we surface every action as disabled
  // with `game_ended` for the UI even though the row hasn't flipped
  // to `"ended"` yet. The `buildNodeView` precondition rejects
  // `"ended"` outright.
  const gameDraining = game.status !== "active";

  // CHECK_IN — the only action whose enabled-precondition requires
  // *not* being at this node. `hand_completed` is exempt per §3.10
  // (a completed team can still navigate). When the team is already
  // here CHECK_IN is omitted entirely — the panel surfaces CHECK_OUT
  // instead, and the existing reason union has no natural code for
  // "you're already here" that wouldn't mislead the client.
  if (!atThisNode) {
    if (gameDraining) {
      out.push({ action: "check_in", enabled: false, reason: "game_ended" });
    } else {
      out.push({ action: "check_in", enabled: true });
    }
  }

  // CHECK_OUT — requires the team to be at this node. `hand_completed`
  // exempt (§3.10); a completed team can still leave.
  if (gameDraining) {
    out.push({ action: "check_out", enabled: false, reason: "game_ended" });
  } else if (position == null || position.currentGameNodeId == null) {
    out.push({
      action: "check_out",
      enabled: false,
      reason: "not_checked_in",
    });
  } else if (atDifferentNode) {
    out.push({ action: "check_out", enabled: false, reason: "wrong_node" });
  } else {
    out.push({ action: "check_out", enabled: true });
  }

  // SWAP_TILE — at this node, hand alive, credit gate satisfied, at
  // least one unlocked slot. Per-slot lock state lives on `tiles[k].locked`;
  // the action enables iff *some* slot is currently swappable so the
  // UI knows whether to render the swap surface at all.
  out.push(computeSwapTileAction({
    gameDraining,
    handCompleted,
    position,
    atDifferentNode,
    challengeCountAtNode,
    tiles,
  }));

  // SWAP_LOCATION_TILES — same gating as SWAP_TILE plus "at least two
  // unlocked slots with tiles" so the player has two candidates to
  // swap between.
  out.push(computeSwapLocationTilesAction({
    gameDraining,
    handCompleted,
    position,
    atDifferentNode,
    challengeCountAtNode,
    tiles,
  }));

  // START_CHALLENGE — mirror the precondition order in
  // `start-challenge.ts` so the disabled reason matches the would-be
  // handler rejection exactly.
  out.push(await computeStartChallengeAction(args));

  // CLAIM_WIN — heaviest computation (requires `analyzeHand`). Skip
  // entirely when the cheaper preconditions already fail; only run
  // the analysis when the team is at this node with a live hand.
  out.push(await computeClaimWinAction(args));

  return out;
}

interface SwapBaseArgs {
  gameDraining: boolean;
  handCompleted: boolean;
  position: GameTeamPosition | null;
  atDifferentNode: boolean;
  challengeCountAtNode: number;
  tiles: NodeViewTileDto[];
}

function swapBaseReason(args: SwapBaseArgs): AvailableActionReason | null {
  if (args.gameDraining) return "game_ended";
  if (args.handCompleted) return "hand_completed";
  if (args.position == null || args.position.currentGameNodeId == null) {
    return "not_checked_in";
  }
  if (args.atDifferentNode) return "wrong_node";
  if (args.challengeCountAtNode > 0 && !args.position.pendingSwapCredit) {
    return "swap_credit_required";
  }
  return null;
}

function computeSwapTileAction(args: SwapBaseArgs): AvailableActionDto {
  const base = swapBaseReason(args);
  if (base != null) {
    return { action: "swap_tile", enabled: false, reason: base };
  }
  // At this station, hand alive, credit OK — need at least one slot
  // that's both unlocked AND occupied. Empty unlocked slots aren't
  // swappable (nothing to swap with); locked slots fail the same
  // `slot_locked` gate the handler enforces.
  const hasUnlockedTile = args.tiles.some(
    (t) => !t.locked && t.tile !== null,
  );
  if (!hasUnlockedTile) {
    return { action: "swap_tile", enabled: false, reason: "slot_locked" };
  }
  return { action: "swap_tile", enabled: true };
}

function computeSwapLocationTilesAction(
  args: SwapBaseArgs,
): AvailableActionDto {
  const base = swapBaseReason(args);
  if (base != null) {
    return { action: "swap_location_tiles", enabled: false, reason: base };
  }
  const unlockedWithTile = args.tiles.filter(
    (t) => !t.locked && t.tile !== null,
  ).length;
  if (unlockedWithTile < 2) {
    return {
      action: "swap_location_tiles",
      enabled: false,
      reason: "slot_locked",
    };
  }
  return { action: "swap_location_tiles", enabled: true };
}

async function computeStartChallengeAction(
  args: ComputeActionsArgs,
): Promise<AvailableActionDto> {
  const {
    gameDraining,
    handCompleted,
    position,
    atDifferentNode,
    challengeCountAtNode,
    currentChallenge,
  } = {
    gameDraining: args.game.status !== "active",
    handCompleted: args.team.handCompletedAt != null,
    position: args.position,
    atDifferentNode:
      args.position?.currentGameNodeId != null
      && args.position.currentGameNodeId !== args.nodeId,
    challengeCountAtNode: args.challengeCountAtNode,
    currentChallenge: args.currentChallenge,
  };

  if (gameDraining) {
    return { action: "start_challenge", enabled: false, reason: "game_ended" };
  }
  if (handCompleted) {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "hand_completed",
    };
  }
  if (position == null || position.currentGameNodeId == null) {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "not_checked_in",
    };
  }
  if (atDifferentNode) {
    return { action: "start_challenge", enabled: false, reason: "wrong_node" };
  }
  if (position.creditEarnedInSession) {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "credit_already_used",
    };
  }
  // Mirrors `start-challenge.ts`: any in-progress instance for this
  // team (anywhere in the game) blocks a new START_CHALLENGE.
  const inProgress = await GameChallengeInstance.findOne({
    where: {
      gameId: args.game.id,
      gameTeamId: args.team.id,
      status: "in_progress",
    },
    ...(args.transaction ? { transaction: args.transaction } : {}),
  });
  if (inProgress) {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "challenge_in_progress",
    };
  }
  if (challengeCountAtNode === 0) {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "no_challenge_at_station",
    };
  }
  // `buildCurrentChallenge` already collapses the cooldown lookup into
  // the `status` field; reuse it here so the two surfaces agree on the
  // station's challenge state.
  if (currentChallenge?.status === "cooldown") {
    return {
      action: "start_challenge",
      enabled: false,
      reason: "challenge_on_cooldown",
    };
  }
  return { action: "start_challenge", enabled: true };
}

async function computeClaimWinAction(
  args: ComputeActionsArgs,
): Promise<AvailableActionDto> {
  const {
    game,
    team,
    position,
    nodeId,
    tiles,
    challengeCountAtNode,
    redFivesEnabled,
    transaction,
  } = args;

  const gameDraining = game.status !== "active";
  const handCompleted = team.handCompletedAt != null;
  const atThisNode = position?.currentGameNodeId === nodeId;
  const atDifferentNode =
    position?.currentGameNodeId != null && !atThisNode;

  if (gameDraining) {
    return { action: "claim_win", enabled: false, reason: "game_ended" };
  }
  if (handCompleted) {
    return { action: "claim_win", enabled: false, reason: "hand_completed" };
  }
  if (position == null || position.currentGameNodeId == null) {
    return {
      action: "claim_win",
      enabled: false,
      reason: "not_checked_in",
    };
  }
  if (atDifferentNode) {
    return { action: "claim_win", enabled: false, reason: "wrong_node" };
  }
  if (challengeCountAtNode > 0 && !position.pendingSwapCredit) {
    return {
      action: "claim_win",
      enabled: false,
      reason: "swap_credit_required",
    };
  }

  // Visible-and-unlocked station tiles are the only `CLAIM_WIN`
  // candidates (the handler rejects locked / off-station picks). Bail
  // before running `analyzeHand` when the station offers nothing
  // claimable; emit `slot_locked` when every visible tile is locked,
  // `no_winning_wait` when the station is just empty of claimable tiles.
  const candidates = tiles.filter(
    (t) => t.visible && !t.locked && t.tile !== null,
  );
  const lockedVisible = tiles.filter(
    (t) => t.visible && t.locked && t.tile !== null,
  );
  if (candidates.length === 0) {
    if (lockedVisible.length > 0) {
      return { action: "claim_win", enabled: false, reason: "slot_locked" };
    }
    return {
      action: "claim_win",
      enabled: false,
      reason: "no_winning_wait",
    };
  }

  const seatWind = teamCodeToWindRank(team.teamDefinition?.code);
  if (seatWind == null) {
    // Same invariant as `claim-win.ts`: every game team has a
    // `team_definition`. Missing code is a query / data bug.
    throw new HttpError(
      500,
      "internal_error",
      `Cannot derive seat wind for team ${team.id} in node-view`,
    );
  }
  const roundWind = game.roundWind as WindRank;

  const handTiles = await loadTeamHandTiles(
    transaction ? { gameTeamId: team.id, transaction } : { gameTeamId: team.id },
  );
  if (handTiles.length !== 13) {
    // Mid-swap transient (12 / 14 tiles), pre-deal (0), or a
    // post-claim hand (14, but `handCompleted` was already true and
    // we'd have bailed above). Treat as not-tenpai for the UI.
    return { action: "claim_win", enabled: false, reason: "not_tenpai" };
  }

  const doraIndicator = await loadDoraIndicator({
    gameId: game.id,
    transaction,
  });

  const analysis = analyzeHand({
    tiles: handTiles,
    seatWind,
    roundWind,
    redFivesEnabled,
    doraIndicators: doraIndicator ? [doraIndicator] : [],
  });
  if (analysis.shanten !== 0 || !analysis.waits) {
    return { action: "claim_win", enabled: false, reason: "not_tenpai" };
  }

  const winningCandidate = pickWinningCandidate(analysis.waits, candidates);
  if (!winningCandidate) {
    return {
      action: "claim_win",
      enabled: false,
      reason: "no_winning_wait",
    };
  }
  return { action: "claim_win", enabled: true };
}

interface DoraIndicatorRow {
  suit: string;
  rank: number;
}

async function loadDoraIndicator(args: {
  gameId: string;
  transaction?: Transaction;
}): Promise<DoraIndicator | null> {
  const rows = await sequelize.query<DoraIndicatorRow>(
    `SELECT tt.suit, tt.rank
       FROM game_tile_placements p
       INNER JOIN game_tiles t  ON t.id = p.game_tile_id
       INNER JOIN tile_types tt ON tt.id = t.tile_type_id
      WHERE t.game_id = :gameId
        AND p.dead_wall_index = 0
      LIMIT 1`,
    {
      replacements: { gameId: args.gameId },
      type: QueryTypes.SELECT,
      ...(args.transaction ? { transaction: args.transaction } : {}),
    },
  );
  const row = rows[0];
  if (!row) return null;
  return { suit: row.suit as DoraIndicator["suit"], rank: row.rank };
}

/**
 * Find a wait whose tile is currently visible-and-unlocked at the
 * station. Returns the matching wait (or `null` when none of the
 * orchestrator's waits map to a present, swappable station tile).
 * Mirrors `claim-win.ts::pickWinningWait` but loops over the station
 * candidates rather than a single submitted `stationTileId`.
 */
function pickWinningCandidate(
  waits: ReadonlyArray<AnalyzedWait>,
  candidates: NodeViewTileDto[],
): AnalyzedWait | null {
  for (const wait of waits) {
    for (const candidate of candidates) {
      const tile = candidate.tile;
      if (tile == null) continue;
      if (
        wait.tile.suit === tile.suit
        && wait.tile.rank === tile.rank
        && wait.tile.copyIndex === tile.copyIndex
      ) {
        return wait;
      }
    }
  }
  return null;
}
