import type { Transaction } from "sequelize";
import { Challenge } from "../models/challenge.ts";
import { GameChallengeInstance } from "../models/game-challenge-instance.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";

export interface PickedChallenge {
  /** The selected `GameNodeChallenge` row for this team's current pick. */
  row: GameNodeChallenge;
  /**
   * The team's most-recent `GameChallengeInstance` for the picked row,
   * or `null` if the team has never attempted this specific row.
   * Callers use this to decode the surfaced status
   * (`available` / `in_progress` / `cooldown`) and to drive cooldown
   * guards without re-querying.
   */
  latestInstanceForRow: GameChallengeInstance | null;
}

/**
 * Picks the `GameNodeChallenge` row to surface for `gameTeamId` at
 * `gameNodeId`, applying the per-team cycle rule used by both the
 * projection (`buildCurrentChallenge`) and the `START_CHALLENGE`
 * handler so the two surfaces always agree on "which card is up next":
 *
 *   - no prior attempt at this node    -> `sort_order = 0`
 *   - latest is `in_progress`          -> pin (the team is mid-attempt)
 *   - latest is `failed` (explicit or
 *     `autoForfeitActiveChallenge`)    -> pin (retry the same card)
 *   - latest is `completed`            -> advance to `(latestIndex + 1)
 *                                         mod N` (wrap at end of queue)
 *
 * Other reserved statuses (`submitted` / `approved` / `rejected` /
 * `cancelled` / `active`) are unreachable in the honor-system MVP; we
 * default to "pin" defensively so a future workflow can't accidentally
 * skip a card.
 *
 * Returns `null` only when the station has no challenges configured.
 *
 * Pass `includeChallenge` when the caller needs the challenge content
 * (title / description / flavor / image) eager-loaded on the returned
 * row. The projection does; the handler does not.
 */
export async function pickCurrentChallengeForTeam(args: {
  gameNodeId: string;
  gameTeamId: string;
  transaction?: Transaction;
  includeChallenge?: boolean;
}): Promise<PickedChallenge | null> {
  const { gameNodeId, gameTeamId, transaction, includeChallenge } = args;

  const allRows = await GameNodeChallenge.findAll({
    where: { gameNodeId },
    order: [["sortOrder", "ASC"]],
    include: includeChallenge
      ? [
          {
            model: Challenge,
            required: true,
            attributes: [
              "id",
              "title",
              "description",
              "flavorText",
              "imageUrl",
            ],
          },
        ]
      : [],
    transaction,
  });
  if (allRows.length === 0) return null;

  const rowIds = allRows.map((row) => row.id);

  const latestAtNode = await GameChallengeInstance.findOne({
    where: { gameTeamId, gameNodeChallengeId: rowIds },
    order: [["createdAt", "DESC"]],
    transaction,
  });

  let pickedIndex = 0;
  let latestInstanceForRow: GameChallengeInstance | null = null;

  if (latestAtNode) {
    const latestIndex = allRows.findIndex(
      (row) => row.id === latestAtNode.gameNodeChallengeId,
    );
    // Defensive: if the latest row is somehow no longer in the
    // queue (e.g. the queue shrank between attempts — never happens
    // today, but cheap to guard) fall back to sort_order 0 + treat
    // the team as if they had no history.
    if (latestIndex === -1) {
      pickedIndex = 0;
      latestInstanceForRow = null;
    } else if (latestAtNode.status === "completed") {
      pickedIndex = (latestIndex + 1) % allRows.length;
      // The picked row is a different row from `latestAtNode`'s row,
      // so we need to fetch its own history below.
      latestInstanceForRow = null;
    } else {
      // `in_progress`, `failed`, and any reserved status -> pin.
      pickedIndex = latestIndex;
      latestInstanceForRow = latestAtNode;
    }
  }

  const pickedRow = allRows[pickedIndex]!;

  if (latestInstanceForRow == null && latestAtNode != null) {
    // We advanced past the row whose latest we already loaded; fetch
    // the picked row's own latest for status / cooldown decoding.
    latestInstanceForRow = await GameChallengeInstance.findOne({
      where: { gameTeamId, gameNodeChallengeId: pickedRow.id },
      order: [["createdAt", "DESC"]],
      transaction,
    });
  }

  return { row: pickedRow, latestInstanceForRow };
}
