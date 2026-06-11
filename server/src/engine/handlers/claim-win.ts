import { Op, QueryTypes } from "sequelize";
import type {
  CommandContext,
  CommandHandler,
  CommandResult,
  EmittedEvent,
} from "../process-command.ts";
import { sequelize } from "../../config/database.ts";
import { HttpError } from "../../lib/http-error.ts";
import { Game } from "../../models/game.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameNodeChallenge } from "../../models/game-node-challenge.ts";
import { GameRuleFlag } from "../../models/game-rule-flag.ts";
import { GameScheduledJob } from "../../models/game-scheduled-job.ts";
import { GameTeam } from "../../models/game-team.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { GameTilePlacement } from "../../models/game-tile-placement.ts";
import { TeamDefinition } from "../../models/team-definition.ts";
import {
  analyzeHand,
  type AnalyzedWait,
  type DoraIndicator,
  type Tile,
  type WindRank,
} from "../../scoring/index.ts";
import { teamCodeToWindRank } from "../../scoring/seat-wind.ts";
import { triggerSchedulerNow } from "../../scheduler/worker.ts";
import { assertSlotUnlocked } from "../../services/slot-visibility.ts";
import { RED_FIVES_RULE_KEY } from "../../tiles/red-five.ts";
import { autoForfeitActiveChallenge } from "../challenge-lifecycle.ts";
import { assertNotHandCompleted } from "../hand-completed-lock.ts";
import { loadTeamHandTiles } from "../team-hand-tiles.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

interface ClaimWinPayload {
  /**
   * `game_tiles.id` of the station tile the team is claiming as their
   * winning 14th tile. Must currently be at the team's checked-in
   * station (i.e. the placement's `game_node_id` matches the team's
   * position and `slot_index` is unlocked).
   */
  stationTileId: string;
  /** Phase L: raw geolocation sample (warn+allow — see `recordCommandGeolocation`). */
  rawGeo: unknown;
}

function parsePayload(payload: Record<string, unknown>): ClaimWinPayload {
  const stationTileId = payload.stationTileId;
  if (typeof stationTileId !== "string" || stationTileId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CLAIM_WIN requires a string stationTileId in the payload",
    );
  }
  return { stationTileId, rawGeo: payload.geo };
}

interface DoraIndicatorRow {
  suit: string;
  rank: number;
}

async function loadDoraIndicator(args: {
  gameId: string;
  transaction: CommandContext["transaction"];
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
      transaction: args.transaction,
    },
  );
  const row = rows[0];
  if (!row) return null;
  return { suit: row.suit as DoraIndicator["suit"], rank: row.rank };
}

interface StationTileRow {
  copy_index: number;
  suit: string;
  rank: number;
}

async function loadStationTileIdentity(args: {
  stationTileId: string;
  transaction: CommandContext["transaction"];
}): Promise<Tile | null> {
  const rows = await sequelize.query<StationTileRow>(
    `SELECT t.copy_index, tt.suit, tt.rank
       FROM game_tiles t
       INNER JOIN tile_types tt ON tt.id = t.tile_type_id
      WHERE t.id = :stationTileId
      LIMIT 1`,
    {
      replacements: { stationTileId: args.stationTileId },
      type: QueryTypes.SELECT,
      transaction: args.transaction,
    },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    suit: row.suit,
    rank: row.rank,
    copyIndex: row.copy_index,
  };
}

/**
 * Pick the winning `AnalyzedWait` whose tile matches the claimed station
 * tile. Tile equality is on `(suit, rank, copyIndex)` so a red-five and
 * a non-red copy of the same suit+rank produce distinct waits in the
 * orchestrator output — the team must claim the specific copy that
 * actually scores best.
 */
function pickWinningWait(
  waits: ReadonlyArray<AnalyzedWait>,
  stationTile: Tile,
): AnalyzedWait | null {
  for (const wait of waits) {
    if (
      wait.tile.suit === stationTile.suit &&
      wait.tile.rank === stationTile.rank &&
      wait.tile.copyIndex === stationTile.copyIndex
    ) {
      return wait;
    }
  }
  return null;
}

/**
 * Phase J — TDD §3.10 `CLAIM_WIN`.
 *
 * Claim a station tile as the team's winning 14th tile. The mechanic:
 *
 *   1. Team must be checked in at a station (`409 not_checked_in`),
 *      and the station tile must occupy a slot at that station
 *      (`400 not_at_station`).
 *   2. The claimed slot must be unlocked (`409 slot_locked`, shared
 *      with `SWAP_TILE`'s helper).
 *   3. If the station carries any `game_node_challenges`, the team must
 *      hold a `pending_swap_credit` — same credit gate as `SWAP_TILE`.
 *   4. The team's 13-tile hand plus the station tile must form a real
 *      winning hand (`shanten === -1`), and the orchestrator's
 *      best-scoring wait for that exact `(suit, rank, copyIndex)` must
 *      yield ≥1 han (`409 not_a_winning_tile` on miss).
 *   5. On success:
 *      - The placement is moved from the node into the team's hand
 *        (one-way; no swapping in the opposite direction — the slot is
 *        left empty for other teams).
 *      - `game_teams.hand_completed_at + winning_tile_id + winning_node_id
 *        + final_han + final_fu + final_points + final_yaku_keys` are
 *        stamped from the winning `AnalyzedWait`.
 *      - Any in-progress challenge for the team is auto-forfeited (the
 *        team cannot use up their newly-locked hand on a challenge).
 *      - `pending_swap_credit` is cleared if the credit was consumed.
 *
 * Chunk 3 adds the auto-`GAME_END` upsert on top of this handler. This
 * commit emits only the `CLAIM_WIN` event; the `GAME_ENDED` event lands
 * separately through the scheduler.
 */
export const claimWinHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { stationTileId, rawGeo } = parsePayload(ctx.payload);

    await assertNotHandCompleted({
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position || position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team must be checked in at a station to claim a winning tile",
      );
    }

    const stationPlacement = await GameTilePlacement.findOne({
      where: { gameTileId: stationTileId },
      transaction: ctx.transaction,
    });
    if (
      !stationPlacement ||
      stationPlacement.gameNodeId !== position.currentGameNodeId ||
      stationPlacement.slotIndex == null
    ) {
      throw new HttpError(
        400,
        "not_at_station",
        `Tile ${stationTileId} is not at the team's current station`,
      );
    }
    const stationSlotIndex = stationPlacement.slotIndex;

    const station = await GameNode.findByPk(position.currentGameNodeId, {
      transaction: ctx.transaction,
    });
    if (!station) {
      throw new HttpError(
        500,
        "internal_error",
        `Station ${position.currentGameNodeId} not found mid-handler`,
      );
    }

    // Phase L: capture telemetry against the team's current station. The
    // helper silently drops malformed input and may mutate
    // `position.lastKnown_*`. The save happens further down — either via
    // the existing credit-consume branch, or via the geo-only path we OR
    // in there.
    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: station,
    });

    const game = await Game.findByPk(ctx.gameId, {
      transaction: ctx.transaction,
    });
    if (!game) {
      throw new HttpError(
        500,
        "internal_error",
        `Game ${ctx.gameId} not found mid-handler`,
      );
    }
    assertSlotUnlocked(
      game,
      stationSlotIndex,
      `Slot ${stationSlotIndex} at ${station.code}`,
    );

    // Phase H credit gate (shared with SWAP_TILE): claiming a winning
    // tile counts as the team's swap for this check-in session, so it
    // must be paid for if the station carries any challenges.
    const challengeCount = await GameNodeChallenge.count({
      where: { gameNodeId: station.id },
      transaction: ctx.transaction,
    });
    if (challengeCount > 0 && !position.pendingSwapCredit) {
      throw new HttpError(
        409,
        "swap_credit_required",
        `Team must complete a challenge at ${station.code} before claiming`,
      );
    }

    const team = await GameTeam.findByPk(ctx.gameTeamId, {
      include: [TeamDefinition],
      transaction: ctx.transaction,
    });
    if (!team) {
      throw new HttpError(
        500,
        "internal_error",
        `Game team ${ctx.gameTeamId} not found mid-handler`,
      );
    }
    const seatWind = teamCodeToWindRank(team.teamDefinition?.code);
    if (seatWind == null) {
      throw new HttpError(
        500,
        "internal_error",
        `Cannot derive seat wind for team ${ctx.gameTeamId} (code: ${team.teamDefinition?.code ?? "<missing>"})`,
      );
    }
    const roundWind = game.roundWind as WindRank;

    const stationTile = await loadStationTileIdentity({
      stationTileId,
      transaction: ctx.transaction,
    });
    if (!stationTile) {
      // The placement existed (we just loaded it above), so the tile
      // must too. Fail loud rather than silently scoring the wrong hand.
      throw new HttpError(
        500,
        "internal_error",
        `Game tile ${stationTileId} resolved to a placement but no tile row`,
      );
    }

    const handTiles = await loadTeamHandTiles({
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });
    if (handTiles.length !== 13) {
      // Wrong hand size: scoring needs exactly 13 + 1 = 14 tiles. Surface
      // as a clear validation error rather than letting `analyzeHand`
      // return shanten >= 1 (which we'd then re-throw as
      // not_a_winning_tile — but the failure mode is different and worth
      // distinguishing for the client).
      throw new HttpError(
        409,
        "not_a_winning_tile",
        `Team has ${handTiles.length} hand tiles; need 13 before claiming`,
      );
    }

    const redFivesFlag = await GameRuleFlag.findOne({
      where: { gameId: ctx.gameId, ruleKey: RED_FIVES_RULE_KEY },
      transaction: ctx.transaction,
    });
    const redFivesEnabled = redFivesFlag?.enabled ?? false;

    const doraIndicator = await loadDoraIndicator({
      gameId: ctx.gameId,
      transaction: ctx.transaction,
    });

    const handPlusClaim: Tile[] = [...handTiles, stationTile];
    const analysis = analyzeHand({
      tiles: handPlusClaim,
      seatWind,
      roundWind,
      redFivesEnabled,
      doraIndicators: doraIndicator ? [doraIndicator] : [],
    });
    if (analysis.shanten !== -1 || !analysis.waits) {
      throw new HttpError(
        409,
        "not_a_winning_tile",
        `Tile ${stationTileId} does not complete the team's hand`,
      );
    }

    const winning = pickWinningWait(analysis.waits, stationTile);
    if (!winning || winning.han === 0) {
      throw new HttpError(
        409,
        "not_a_winning_tile",
        `Tile ${stationTileId} does not complete the team's hand`,
      );
    }

    // One-way placement move: the station tile leaves its slot and
    // joins the team's hand. The tri-state CHECK on
    // `game_tile_placements` (chunk 1 of the dead-wall migration) is
    // satisfied because exactly one of the three target columns
    // (`game_team_id`) is non-null after the update.
    stationPlacement.gameNodeId = null;
    stationPlacement.slotIndex = null;
    stationPlacement.gameTeamId = ctx.gameTeamId;
    await stationPlacement.save({ transaction: ctx.transaction });

    // Snapshot the completion onto `game_teams`. The multi-column CHECK
    // requires all five required columns to be set when
    // `hand_completed_at` is non-null — they all come from the
    // `AnalyzedWait` shape.
    team.handCompletedAt = new Date();
    team.winningTileId = stationTileId;
    team.winningNodeId = station.id;
    team.finalHan = winning.han;
    team.finalFu = winning.fu;
    team.finalPoints = winning.points;
    team.finalYakuKeys = winning.yaku.map((y) => ({
      name: y.name,
      han: y.han,
    }));
    await team.save({ transaction: ctx.transaction });

    // Consume the credit (same as SWAP_TILE) when one was required.
    // `credit_earned_in_session` stays sticky so a follow-up
    // START_CHALLENGE attempt during the same session is rejected — not
    // that the locked-out team could issue one anymore, but the
    // bookkeeping invariant is identical to SWAP_TILE.
    if (challengeCount > 0) {
      position.pendingSwapCredit = false;
    }
    // Save the position iff something changed: credit consumption (above)
    // or the Phase L geo helper recording a sample. Free-swap stations
    // with no geo still skip the save (preserves original behaviour).
    if (challengeCount > 0 || geoResult.geo != null) {
      await position.save({ transaction: ctx.transaction });
    }

    // Auto-forfeit any in-progress challenge. The team cannot mutate
    // tiles after CLAIM_WIN, so a lingering `in_progress` row would
    // strand the challenge UI in a permanently-blocked state. Mirrors
    // the implicit-forfeit branch shared by CHECK_IN / CHECK_OUT.
    const autoForfeitEvent: EmittedEvent | null =
      await autoForfeitActiveChallenge({
        transaction: ctx.transaction,
        gameId: ctx.gameId,
        gameTeamId: ctx.gameTeamId,
      });

    // Phase J early-end (chunk 3): if this was the last incomplete
    // team, fast-forward the `GAME_END` scheduled job so the next
    // scheduler tick flips the game to `ended` and emits `GAME_ENDED`.
    // The `Op.is: null` filter only counts genuinely incomplete teams;
    // the team we just stamped above is committed-in-tx, so the count
    // returns 0 exactly when every team is done.
    const remainingIncomplete = await GameTeam.count({
      where: { gameId: ctx.gameId, handCompletedAt: { [Op.is]: null } },
      transaction: ctx.transaction,
    });
    if (remainingIncomplete === 0) {
      await GameScheduledJob.update(
        { runAt: new Date(), status: "pending" },
        {
          where: { gameId: ctx.gameId, jobType: "GAME_END" },
          transaction: ctx.transaction,
        },
      );
      // Best-effort kick: ask the scheduler worker (if registered) to
      // run a tick the moment our transaction commits. The periodic
      // poll picks it up on the next tick anyway — the trigger just
      // tightens the latency window. `triggerSchedulerNow` is a no-op
      // when no worker is registered (e.g. unit-test contexts).
      ctx.transaction.afterCommit(() => {
        triggerSchedulerNow();
      });
    }

    const claimWinPayload: Record<string, unknown> = {
      nodeId: station.id,
      nodeCode: station.code,
      stationTileId,
      slotIndex: stationSlotIndex,
      finalHan: winning.han,
      finalFu: winning.fu,
      finalPoints: winning.points,
      finalYaku: winning.yaku.map((y) => ({ name: y.name, han: y.han })),
      isYakuman: winning.isYakuman,
    };
    if (geoResult.geo != null) {
      claimWinPayload.geo = geoResult.geo;
      claimWinPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    const events: EmittedEvent[] = [
      {
        eventType: "CLAIM_WIN",
        payload: claimWinPayload,
      },
    ];
    if (autoForfeitEvent) {
      events.push(autoForfeitEvent);
    }
    return { events };
  },
};
