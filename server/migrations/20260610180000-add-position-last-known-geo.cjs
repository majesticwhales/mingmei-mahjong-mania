'use strict';

/**
 * Phase L — `game_team_positions` last-known geo (chunk 1 of 4).
 *
 * Adds four nullable telemetry columns described in TDD §3.12 and §4.5.
 * Behaviour-neutral on its own: no handler reads or writes these columns
 * until chunk 2 (CHECK_IN / CHECK_OUT rewire) and chunk 3 (remaining
 * handlers) land.
 *
 * Schema changes (single transaction):
 *
 *   1. `game_team_positions.last_known_latitude DOUBLE PRECISION NULL`
 *      - Most recent latitude reported by any user-driven command from
 *        the team's client. Independent of `last_check_in_latitude`,
 *        which remains the CHECK_IN-time snapshot.
 *
 *   2. `game_team_positions.last_known_longitude DOUBLE PRECISION NULL`
 *
 *   3. `game_team_positions.last_known_accuracy DOUBLE PRECISION NULL`
 *      + CHECK `last_known_accuracy IS NULL OR last_known_accuracy >= 0`.
 *
 *   4. `game_team_positions.last_known_seen_at TIMESTAMPTZ NULL`
 *      - Server clock at the moment the engine recorded the sample.
 *
 * Pre-existing rows backfill safely: every existing `game_team_positions`
 * row gets all four columns set to NULL, which trivially satisfies the
 * non-negative-accuracy CHECK.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'game_team_positions',
        'last_known_latitude',
        { type: Sequelize.DOUBLE, allowNull: true },
        { transaction },
      );

      await queryInterface.addColumn(
        'game_team_positions',
        'last_known_longitude',
        { type: Sequelize.DOUBLE, allowNull: true },
        { transaction },
      );

      await queryInterface.addColumn(
        'game_team_positions',
        'last_known_accuracy',
        { type: Sequelize.DOUBLE, allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_team_positions
        ADD CONSTRAINT game_team_positions_last_known_accuracy_nonneg_check
        CHECK (last_known_accuracy IS NULL OR last_known_accuracy >= 0);
        `,
        { transaction },
      );

      await queryInterface.addColumn(
        'game_team_positions',
        'last_known_seen_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn(
        'game_team_positions',
        'last_known_seen_at',
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE game_team_positions DROP CONSTRAINT IF EXISTS game_team_positions_last_known_accuracy_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'game_team_positions',
        'last_known_accuracy',
        { transaction },
      );

      await queryInterface.removeColumn(
        'game_team_positions',
        'last_known_longitude',
        { transaction },
      );

      await queryInterface.removeColumn(
        'game_team_positions',
        'last_known_latitude',
        { transaction },
      );
    });
  },
};
