import type { Transaction } from "sequelize";
import { HttpError } from "../lib/http-error.ts";
import { GameTeam } from "../models/game-team.ts";

/**
 * Phase J — TDD §3.10 hand-completed lock. Reject any mutation command
 * issued by a team whose hand has already been completed via `CLAIM_WIN`.
 *
 * Applied at the top of every handler that mutates tiles or the
 * challenge state machine:
 *
 *   - `SWAP_TILE`
 *   - `SWAP_LOCATION_TILES`
 *   - `START_CHALLENGE`
 *   - `CHALLENGE_COMPLETED`
 *   - `CHALLENGE_FORFEITED`
 *   - `CLAIM_WIN` itself (so the second click is rejected with the same
 *     code rather than racing past the wait-set check)
 *
 * `CHECK_IN` / `CHECK_OUT` deliberately do NOT call this — observers may
 * keep traveling around the map after their hand is sealed.
 *
 * The check is a single `SELECT` against the team row inside the caller's
 * transaction, so it inherits the per-game command-queue serialization
 * and never races with the upstream `CLAIM_WIN` that flipped the column.
 */
export async function assertNotHandCompleted(args: {
  gameTeamId: string;
  transaction: Transaction;
}): Promise<void> {
  const team = await GameTeam.findByPk(args.gameTeamId, {
    attributes: ["id", "handCompletedAt"],
    transaction: args.transaction,
  });
  if (team?.handCompletedAt != null) {
    throw new HttpError(
      409,
      "hand_completed",
      "Team has already completed their hand and cannot mutate tiles",
    );
  }
}
