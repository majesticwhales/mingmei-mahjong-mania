'use strict';

/**
 * Per-slot visibility rules (chunk 2 of 6): drop the legacy single-slot
 * unique index on `game_tile_placements.game_node_id` and replace it with a
 * pair of indexes that work for `slots_per_node >= 1`:
 *
 *   - A non-unique `(game_node_id)` index for fast lookups by node.
 *   - A partial unique index on `(game_node_id, slot_index) WHERE
 *     game_node_id IS NOT NULL` so two tiles can never occupy the same
 *     addressable slot on a node, while still allowing many tiles per node.
 *
 * The chunk 1 backfill already populated `slot_index` for existing node
 * placements (`ROW_NUMBER() OVER (PARTITION BY game_node_id ORDER BY
 * created_at, id) - 1`), so the partial unique index will not collide on
 * pre-existing data. Going forward, the dealer (`tile-deal-service`, updated
 * in this same chunk) populates `slot_index = s` on every new node
 * placement.
 *
 * Deliberately deferred to chunk 3:
 *
 *   - The `slot_index NOT NULL iff game_node_id NOT NULL` CHECK. The current
 *     `swap-tile` / `swapPlacements` implementation mutates `game_node_id`
 *     directly without touching `slot_index`, so any node→hand or hand→node
 *     swap would leave a row in a CHECK-violating state. Chunk 3 updates
 *     `swapPlacements` to swap `slot_index` alongside `game_node_id` /
 *     `game_team_id` and then adds the CHECK. Until then the partial unique
 *     index is sufficient because Postgres treats NULL as distinct in unique
 *     indexes — swap-mutated rows with `slot_index = NULL` are simply
 *     ignored by the unique check (still semantically wrong, but no false
 *     conflicts).
 *
 * Wrapped in a single transaction so a mid-way failure leaves no partial
 * schema behind.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        'game_tile_placements',
        'game_tile_placements_game_node_id_unique',
        { transaction },
      );

      await queryInterface.removeIndex(
        'game_tile_placements',
        'game_tile_placements_game_node_id_idx',
        { transaction },
      );

      await queryInterface.addIndex('game_tile_placements', ['game_node_id'], {
        name: 'game_tile_placements_game_node_id_idx',
        transaction,
      });

      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX game_tile_placements_node_slot_unique
        ON game_tile_placements (game_node_id, slot_index)
        WHERE game_node_id IS NOT NULL;
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS game_tile_placements_node_slot_unique;`,
        { transaction },
      );

      await queryInterface.removeIndex(
        'game_tile_placements',
        'game_tile_placements_game_node_id_idx',
        { transaction },
      );

      // Restore the legacy unique-on-game_node_id index. This will fail if
      // the DB has been mutated to a `slots_per_node > 1` state (multiple
      // rows per node); rollback is intended for single-slot dev/test DBs.
      await queryInterface.addIndex('game_tile_placements', ['game_node_id'], {
        unique: true,
        name: 'game_tile_placements_game_node_id_unique',
        transaction,
      });
    });
  },
};
