'use strict';

/**
 * Per-slot visibility rules (chunk 3 of 6): enforce the `slot_index` shape
 * invariant now that every producer keeps `slot_index` in lockstep with
 * `game_node_id`.
 *
 *   CHECK (
 *     (game_node_id IS NULL AND slot_index IS NULL)
 *     OR (game_node_id IS NOT NULL AND slot_index IS NOT NULL AND slot_index >= 0)
 *   )
 *
 * The upper bound (`slot_index < games.slots_per_node`) is intentionally
 * NOT in the CHECK — it'd require a join to `games` and is enforced in the
 * dealer and at the API layer instead.
 *
 * Prerequisites already in place:
 *   - chunk 1 backfilled every existing node placement's `slot_index`.
 *   - chunk 2 added the partial unique `(game_node_id, slot_index) WHERE
 *     game_node_id IS NOT NULL` index and updated the dealer to populate
 *     `slot_index` on every new node placement.
 *   - this chunk also ships the `swapPlacements` update that swaps
 *     `slot_index` alongside `game_node_id` / `game_team_id`, so the CHECK
 *     stays satisfied across every `SWAP_TILE` / `SWAP_LOCATION_TILES`.
 *
 * Wrapped in a single transaction.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        ADD CONSTRAINT game_tile_placements_slot_index_matches_node CHECK (
          (game_node_id IS NULL AND slot_index IS NULL)
          OR (game_node_id IS NOT NULL AND slot_index IS NOT NULL AND slot_index >= 0)
        );
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        DROP CONSTRAINT IF EXISTS game_tile_placements_slot_index_matches_node;
        `,
        { transaction },
      );
    });
  },
};
