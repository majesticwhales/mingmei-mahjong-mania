import type { Transaction } from "sequelize";
import { sequelize } from "../config/database.ts";
import { HttpError } from "../lib/http-error.ts";
import { GameTilePlacement } from "../models/game-tile-placement.ts";

export interface PlacementSnapshot {
  gameTileId: string;
  gameNodeId: string | null;
  gameTeamId: string | null;
  /**
   * Slot ordinal at `gameNodeId` (0-based). Non-null iff `gameNodeId` is
   * non-null. Included so callers can observe the vacated slot a tile
   * occupied before the swap (e.g. for replay logs / projections).
   */
  slotIndex: number | null;
}

export interface SwapPlacementsResult {
  /** Placements as they were BEFORE the swap (useful for event payloads). */
  before: { a: PlacementSnapshot; b: PlacementSnapshot };
}

/**
 * Mechanically exchange the `game_node_id` / `game_team_id` / `slot_index`
 * targets of the two `game_tile_placements` rows identified by the supplied
 * game-tile ids.
 *
 * Shared low-level primitive for:
 *   - `SWAP_TILE` (hand <-> node at current station)
 *   - `SWAP_LOCATION_TILES` (node <-> node; arrives with the challenge phase)
 *
 * Per the per-slot rules rollout (TDD §4.4): slot identity belongs to the
 * node, not the tile, so an incoming hand tile takes the exact slot the
 * outgoing station tile vacated, and a node-to-node swap exchanges slots
 * along with nodes. All three columns (`game_node_id`, `game_team_id`,
 * `slot_index`) move together, which simultaneously keeps the XOR
 * invariant (one of node/team set) and the `slot_index NOT NULL iff
 * game_node_id NOT NULL` invariant satisfied.
 *
 * Implemented as a single UPDATE so both rows mutate atomically with respect
 * to any concurrent readers and to satisfy the partial unique index on
 * `(game_node_id, slot_index)` without an intermediate-state collision.
 *
 * No semantic validation: the caller is responsible for ensuring the
 * resulting placements still satisfy the XOR invariant (one of node/team set
 * on each), e.g. by passing a hand placement + a node placement (SWAP_TILE)
 * or two node placements (SWAP_LOCATION_TILES). Mixing two hand placements
 * would still produce a valid XOR state, but would not represent a real
 * game move.
 */
export async function swapPlacements(
  transaction: Transaction,
  gameTileIdA: string,
  gameTileIdB: string,
): Promise<SwapPlacementsResult> {
  if (gameTileIdA === gameTileIdB) {
    throw new HttpError(
      400,
      "invalid_swap",
      "Cannot swap a tile with itself",
    );
  }

  const placements = await GameTilePlacement.findAll({
    where: { gameTileId: [gameTileIdA, gameTileIdB] },
    transaction,
  });

  const a = placements.find((p) => p.gameTileId === gameTileIdA);
  const b = placements.find((p) => p.gameTileId === gameTileIdB);
  if (!a || !b) {
    throw new HttpError(
      404,
      "tile_not_found",
      `Missing placement for tile ${!a ? gameTileIdA : gameTileIdB}`,
    );
  }

  const before: SwapPlacementsResult["before"] = {
    a: {
      gameTileId: a.gameTileId,
      gameNodeId: a.gameNodeId,
      gameTeamId: a.gameTeamId,
      slotIndex: a.slotIndex,
    },
    b: {
      gameTileId: b.gameTileId,
      gameNodeId: b.gameNodeId,
      gameTeamId: b.gameTeamId,
      slotIndex: b.slotIndex,
    },
  };

  await sequelize.query(
    `UPDATE game_tile_placements AS p
     SET
       game_node_id = src.new_node_id,
       game_team_id = src.new_team_id,
       slot_index   = src.new_slot_index,
       updated_at   = NOW()
     FROM (VALUES
       (CAST(:tileA AS uuid), CAST(:aNewNode AS uuid), CAST(:aNewTeam AS uuid), CAST(:aNewSlot AS integer)),
       (CAST(:tileB AS uuid), CAST(:bNewNode AS uuid), CAST(:bNewTeam AS uuid), CAST(:bNewSlot AS integer))
     ) AS src(game_tile_id, new_node_id, new_team_id, new_slot_index)
     WHERE p.game_tile_id = src.game_tile_id`,
    {
      replacements: {
        tileA: gameTileIdA,
        tileB: gameTileIdB,
        aNewNode: b.gameNodeId,
        aNewTeam: b.gameTeamId,
        aNewSlot: b.slotIndex,
        bNewNode: a.gameNodeId,
        bNewTeam: a.gameTeamId,
        bNewSlot: a.slotIndex,
      },
      transaction,
    },
  );

  return { before };
}
