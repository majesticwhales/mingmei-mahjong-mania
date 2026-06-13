import type { Transaction } from "sequelize";
import type { Game } from "../../models/game.ts";
import { GameTeam } from "../../models/game-team.ts";
import type {
  SchedulerJobHandler,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Where the end-of-game transition originated. Threaded into `runGameEnd`
 * so the `GAME_ENDED` event payload's `endReason` can distinguish a
 * scheduler-driven termination (`timer`) from an admin-driven early
 * end (`manual`). `all_teams_completed` always wins when every team
 * already claimed — the natural label beats the trigger.
 */
export type GameEndTrigger = "scheduled" | "manual";

/**
 * Flip an active game to `ended`.
 *
 * v1 collapses the TDD §5 `active → ending → ended` lifecycle into a single
 * transition: `active → ended`. The intermediate `ending` state is reserved
 * for the queue-drain handoff once the command-queue processor lands, at
 * which point this handler will move to `ending` and the queue processor
 * will finalize to `ended`.
 *
 * Phase J (TDD §3.10) — two responsibilities on this transition:
 *
 *   1. **Snapshot incomplete teams.** Any team that didn't `CLAIM_WIN`
 *      before the job fires gets `final_han = final_fu = final_points = 0`
 *      stamped; `hand_completed_at` stays `NULL` so the multi-column CHECK
 *      `game_teams_completion_snapshot_consistent` is satisfied via its
 *      "(hand_completed_at IS NULL) OR (snapshot complete)" disjunction.
 *      `final_yaku_keys` is left `NULL` — the summary endpoint
 *      synthesizes wait sets at request time via `analyzeHand`.
 *   2. **Compute end metadata for the event payload.** `endReason`
 *      precedence:
 *        - every team has `hand_completed_at` -> `"all_teams_completed"`
 *        - `trigger === "manual"` -> `"manual"` (admin pressed end)
 *        - otherwise -> `"timer"` (scheduler-driven timeout)
 *      `winningGameTeamId` is the strict `finalPoints` leader; ties are
 *      reported as `null`.
 *
 * Idempotent: an already-ended game returns success with no event. Any
 * other non-active status (none defined yet in v1) is rejected loudly.
 *
 * Single source of truth: both the scheduler tick (via `gameEndHandler`
 * below) and `endGameEarly` call this helper. The handler shim threads
 * `trigger: "scheduled"`; the admin-driven service threads `"manual"`.
 */
export async function runGameEnd(args: {
  game: Game;
  transaction: Transaction;
  now: Date;
  trigger: GameEndTrigger;
}): Promise<SchedulerJobHandlerOutcome> {
  const { game, transaction, now, trigger } = args;

  if (game.status === "ended") {
    return {};
  }
  if (game.status !== "active") {
    throw new Error(
      `GAME_END can only run on active games; game ${game.id} is ${game.status}`,
    );
  }

  // Load every team's completion snapshot in deterministic order so the
  // tie-break on `(finalPoints DESC, handCompletedAt ASC, id ASC)`
  // produces stable winner selection across runs / replicas.
  const teams = await GameTeam.findAll({
    where: { gameId: game.id },
    order: [["id", "ASC"]],
    transaction,
  });

  // Stamp 0-snapshot onto the noten teams. The "incomplete + final_* = 0"
  // shape is what the summary endpoint keys off (along with the live
  // `analyzeHand` over the 13-tile hand for the wait set).
  for (const team of teams) {
    if (team.handCompletedAt == null) {
      team.finalHan = 0;
      team.finalFu = 0;
      team.finalPoints = 0;
      team.finalYakuKeys = null;
      await team.save({ transaction });
    }
  }

  const allCompleted = teams.every((t) => t.handCompletedAt != null);
  const endReason = allCompleted
    ? "all_teams_completed"
    : trigger === "manual"
      ? "manual"
      : "timer";
  const winningGameTeamId = selectWinningGameTeamId(teams);

  game.status = "ended";
  await game.save({ transaction });

  return {
    events: [
      {
        eventType: "GAME_ENDED",
        payload: {
          endedAt: now.toISOString(),
          endReason,
          winningGameTeamId,
        },
      },
    ],
  };
}

/**
 * Scheduler-registry shim — fires at the game's scheduled end time, which
 * may have been pulled forward to `now()` by `claimWinHandler` when the
 * last team completes their hand. Always threads `trigger: "scheduled"`;
 * the `allCompleted` branch in `runGameEnd` upgrades to
 * `"all_teams_completed"` when applicable.
 */
export const gameEndHandler: SchedulerJobHandler = {
  handle: (ctx) =>
    runGameEnd({
      game: ctx.game,
      transaction: ctx.transaction,
      now: ctx.now,
      trigger: "scheduled",
    }),
};

/**
 * Pick the winning team id by strict `finalPoints` maximum. Ties (two or
 * more teams sharing the top points) return `null` — the product spec
 * treats end-of-game ties as no-winner, deferring the actual tie-break
 * to the human players. Among the tied candidates, the secondary sort by
 * `handCompletedAt ASC` is preserved for any tooling that wants a stable
 * "first to that score" ordering even when no canonical winner emerges.
 *
 * `null` finalPoints (the column default before the snapshot stamp)
 * counts as 0 so a noten team can never out-rank a completed team that
 * scored 0 points.
 */
function selectWinningGameTeamId(
  teams: ReadonlyArray<GameTeam>,
): string | null {
  if (teams.length === 0) return null;

  let bestPoints = -1;
  let bestTeams: GameTeam[] = [];
  for (const team of teams) {
    const points = team.finalPoints ?? 0;
    if (points > bestPoints) {
      bestPoints = points;
      bestTeams = [team];
    } else if (points === bestPoints) {
      bestTeams.push(team);
    }
  }
  if (bestTeams.length !== 1) return null;
  return bestTeams[0]!.id;
}
