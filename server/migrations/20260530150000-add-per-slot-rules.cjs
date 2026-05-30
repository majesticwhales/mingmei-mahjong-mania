'use strict';

/**
 * Per-slot visibility rules (chunk 1 of 6): columns only.
 *
 * Adds the storage needed for addressable per-node slots, each with a
 * uniform game-wide unlock offset and map-visibility flag. CHECK constraints
 * and the partial unique index are deferred to later chunks so this
 * migration can land without simultaneously fixing every producer:
 *
 * - `map_templates` / `lobbies` / `games` gain `slot_unlock_offsets_seconds`
 *   (INTEGER[]) and `slot_map_visible` (BOOLEAN[]) with defaults `{0}` /
 *   `{true}`, matching the default `slots_per_node = 1`. Length-vs-count
 *   CHECKs land in chunk 5 once the lobby config flow keeps the arrays in
 *   sync with `slots_per_node`.
 * - `game_tile_placements` gains a nullable `slot_index INTEGER`. Existing
 *   node placements are backfilled by insertion order (ROW_NUMBER OVER
 *   created_at, id), which matches the dealer's stable per-node insertion
 *   order. The `slot_index NOT NULL iff game_node_id NOT NULL` CHECK plus
 *   the partial unique index `(game_node_id, slot_index) WHERE
 *   game_node_id IS NOT NULL` land in chunk 2's follow-up migration once
 *   the dealer populates `slot_index` on every new node placement.
 *
 * Wrapped in a single transaction so a mid-way failure leaves no partial
 * schema behind.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. map_templates: per-template defaults.
      await queryInterface.addColumn(
        'map_templates',
        'default_slot_unlock_offsets_seconds',
        {
          type: Sequelize.ARRAY(Sequelize.INTEGER),
          allowNull: false,
          defaultValue: [0],
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'map_templates',
        'default_slot_map_visible',
        {
          type: Sequelize.ARRAY(Sequelize.BOOLEAN),
          allowNull: false,
          defaultValue: [true],
        },
        { transaction },
      );

      // 2. lobbies: host-editable, sourced from map_template defaults at create.
      await queryInterface.addColumn(
        'lobbies',
        'slot_unlock_offsets_seconds',
        {
          type: Sequelize.ARRAY(Sequelize.INTEGER),
          allowNull: false,
          defaultValue: [0],
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'lobbies',
        'slot_map_visible',
        {
          type: Sequelize.ARRAY(Sequelize.BOOLEAN),
          allowNull: false,
          defaultValue: [true],
        },
        { transaction },
      );

      // 3. games: snapshot of lobby values at start.
      await queryInterface.addColumn(
        'games',
        'slot_unlock_offsets_seconds',
        {
          type: Sequelize.ARRAY(Sequelize.INTEGER),
          allowNull: false,
          defaultValue: [0],
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'games',
        'slot_map_visible',
        {
          type: Sequelize.ARRAY(Sequelize.BOOLEAN),
          allowNull: false,
          defaultValue: [true],
        },
        { transaction },
      );

      // 4. game_tile_placements: nullable slot_index column + backfill of
      //    existing node placements.
      //
      //    Backfill order: ROW_NUMBER() OVER (PARTITION BY game_node_id ORDER
      //    BY created_at, id). Pre-this-migration the dealer inserted node
      //    tiles in a stable per-node order (loop index 0..slots_per_node-1),
      //    so ordering by insertion timestamp recovers the intended
      //    `slot_index`. The secondary ORDER BY `id` tiebreaks rows created
      //    in the same statement. Hand placements (game_node_id IS NULL)
      //    stay NULL.
      await queryInterface.addColumn(
        'game_tile_placements',
        'slot_index',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY game_node_id
              ORDER BY created_at, id
            ) - 1 AS new_slot_index
          FROM game_tile_placements
          WHERE game_node_id IS NOT NULL
        )
        UPDATE game_tile_placements AS p
        SET slot_index = ranked.new_slot_index
        FROM ranked
        WHERE p.id = ranked.id;
      `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        'game_tile_placements',
        'slot_index',
        { transaction },
      );

      await queryInterface.removeColumn('games', 'slot_map_visible', {
        transaction,
      });
      await queryInterface.removeColumn(
        'games',
        'slot_unlock_offsets_seconds',
        { transaction },
      );

      await queryInterface.removeColumn('lobbies', 'slot_map_visible', {
        transaction,
      });
      await queryInterface.removeColumn(
        'lobbies',
        'slot_unlock_offsets_seconds',
        { transaction },
      );

      await queryInterface.removeColumn(
        'map_templates',
        'default_slot_map_visible',
        { transaction },
      );
      await queryInterface.removeColumn(
        'map_templates',
        'default_slot_unlock_offsets_seconds',
        { transaction },
      );
    });
  },
};
