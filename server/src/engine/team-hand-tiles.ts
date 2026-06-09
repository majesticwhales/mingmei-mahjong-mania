import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../config/database.ts";
import type { Tile } from "../scoring/index.ts";

/**
 * Load the issuing team's current hand placements as a `Tile[]` shaped
 * for the scoring module. Hand-side placements have
 * `(game_node_id, dead_wall_index) IS NULL` and `game_team_id` set
 * (tri-state CHECK on `game_tile_placements`); this query joins through
 * `game_tiles -> tile_types` to surface the scoring-relevant
 * `(suit, rank, copyIndex)` triple.
 *
 * Used by:
 *   - `CLAIM_WIN` handler (Phase J chunk 2) to build the 14-tile complete
 *     hand for `analyzeHand`.
 *   - `GameSummaryService` (Phase J chunk 5) for tenpai re-analysis of
 *     teams that didn't claim a win before `GAME_ENDED`.
 *
 * The result is unordered — callers either pass the array straight into
 * `analyzeHand` (which is order-independent via `tilesToCounts`) or
 * project it through the existing hand-sort comparator. No transaction
 * is required for the read; pass one when running inside a command
 * handler so the load stays consistent with the rest of the handler's
 * transaction.
 */
export async function loadTeamHandTiles(args: {
  gameTeamId: string;
  transaction?: Transaction;
}): Promise<Tile[]> {
  const rows = await sequelize.query<{
    suit: string;
    rank: number;
    copy_index: number;
  }>(
    `SELECT tt.suit, tt.rank, t.copy_index
       FROM game_tile_placements p
       INNER JOIN game_tiles t  ON t.id = p.game_tile_id
       INNER JOIN tile_types tt ON tt.id = t.tile_type_id
      WHERE p.game_team_id = :gameTeamId
        AND p.game_node_id IS NULL
        AND p.dead_wall_index IS NULL`,
    {
      replacements: { gameTeamId: args.gameTeamId },
      type: QueryTypes.SELECT,
      ...(args.transaction ? { transaction: args.transaction } : {}),
    },
  );
  return rows.map((r) => ({
    suit: r.suit,
    rank: r.rank,
    copyIndex: r.copy_index,
  }));
}
