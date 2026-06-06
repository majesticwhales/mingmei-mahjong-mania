'use strict';

/**
 * Dead wall + dora indicator (chunk 1 of 3).
 *
 * Adds storage for the per-game "dead wall": tiles that the dealer mints
 * from the catalog but doesn't place at nodes or deal into team hands.
 * The first tile in the dead wall is the dora indicator (consumed by
 * the scoring module's dora hook, chunk 2). Dead-wall tiles never move:
 * there is no engine command that re-targets them.
 *
 * Schema changes (single transaction):
 *
 *   1. `game_tile_placements.dead_wall_index INTEGER NULL`:
 *      - Position in the dead wall (0-based). Set iff the placement is
 *        in the dead wall.
 *
 *   2. `game_tile_placements`: replace the XOR CHECK with a tri-state
 *      CHECK requiring exactly one of `game_node_id`, `game_team_id`,
 *      `dead_wall_index` to be non-null. `dead_wall_index >= 0` is folded
 *      into the same CHECK so we don't add a second constraint name.
 *
 *   3. `map_templates.default_dead_wall_size INTEGER NOT NULL DEFAULT 0`:
 *      - Per-template default dead-wall size. Lobbies inherit it.
 *
 *   4. `lobbies.dead_wall_size INTEGER NOT NULL DEFAULT 0`:
 *      - Host-editable dead-wall size, sourced from the template default
 *        on lobby creation, snapshotted to `games.dead_wall_size` at start.
 *
 *   5. `games.dead_wall_size INTEGER NOT NULL DEFAULT 0`:
 *      - Snapshotted from `lobby.dead_wall_size` at game start. The dealer
 *        enforces the closed-set invariant
 *          slotsPerNode * nodeCount + handSize * teamCount + deadWallSize
 *          === catalogSize
 *        in application code; the DB doesn't try to express that
 *        cross-table relationship.
 *
 *   6. CHECK `>= 0` on each of the three new `*dead_wall_size` columns.
 *      Upper bound is intentionally NOT enforced in the DB — the dealer
 *      invariant blocks any size that wouldn't consume the full catalog.
 *
 * Pre-existing rows backfill safely. `dead_wall_size` defaults to 0 so
 * games that were started before this migration keep their existing tile
 * layout. `dead_wall_index` is NULL on every existing placement, so the
 * tri-state CHECK reduces to the old XOR for those rows.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. game_tile_placements.dead_wall_index
      await queryInterface.addColumn(
        'game_tile_placements',
        'dead_wall_index',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        { transaction },
      );

      // 2. Replace XOR CHECK with tri-state CHECK.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        DROP CONSTRAINT IF EXISTS game_tile_placements_node_xor_team;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        ADD CONSTRAINT game_tile_placements_target_exactly_one CHECK (
          (game_node_id IS NOT NULL AND game_team_id IS NULL AND dead_wall_index IS NULL)
          OR (game_node_id IS NULL AND game_team_id IS NOT NULL AND dead_wall_index IS NULL)
          OR (
            game_node_id IS NULL
            AND game_team_id IS NULL
            AND dead_wall_index IS NOT NULL
            AND dead_wall_index >= 0
          )
        );
        `,
        { transaction },
      );

      // 3. map_templates.default_dead_wall_size
      await queryInterface.addColumn(
        'map_templates',
        'default_dead_wall_size',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE map_templates
        ADD CONSTRAINT map_templates_default_dead_wall_size_nonneg_check
        CHECK (default_dead_wall_size >= 0);
        `,
        { transaction },
      );

      // 4. lobbies.dead_wall_size
      await queryInterface.addColumn(
        'lobbies',
        'dead_wall_size',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE lobbies
        ADD CONSTRAINT lobbies_dead_wall_size_nonneg_check
        CHECK (dead_wall_size >= 0);
        `,
        { transaction },
      );

      // 5. games.dead_wall_size
      await queryInterface.addColumn(
        'games',
        'dead_wall_size',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE games
        ADD CONSTRAINT games_dead_wall_size_nonneg_check
        CHECK (dead_wall_size >= 0);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE games DROP CONSTRAINT IF EXISTS games_dead_wall_size_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('games', 'dead_wall_size', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE lobbies DROP CONSTRAINT IF EXISTS lobbies_dead_wall_size_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('lobbies', 'dead_wall_size', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE map_templates DROP CONSTRAINT IF EXISTS map_templates_default_dead_wall_size_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'map_templates',
        'default_dead_wall_size',
        { transaction },
      );

      // Restore XOR CHECK.
      await queryInterface.sequelize.query(
        `ALTER TABLE game_tile_placements DROP CONSTRAINT IF EXISTS game_tile_placements_target_exactly_one;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'game_tile_placements',
        'dead_wall_index',
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        ADD CONSTRAINT game_tile_placements_node_xor_team CHECK (
          (game_node_id IS NOT NULL AND game_team_id IS NULL)
          OR (game_node_id IS NULL AND game_team_id IS NOT NULL)
        );
        `,
        { transaction },
      );
    });
  },
};
