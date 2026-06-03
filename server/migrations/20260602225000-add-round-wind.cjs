'use strict';

/**
 * Phase I — Mahjong scoring wiring (chunk 7).
 *
 * Adds `games.round_wind`: the randomized round wind picked at game start
 * and consumed by the scoring module (`analyzeHand`). Encoded as an integer
 * `1..4` matching the wind ranks used elsewhere in the scoring module:
 *   1 = East, 2 = South, 3 = West, 4 = North.
 *
 * Default `1` (East) so existing rows backfill safely; `GameStartService`
 * always overrides with a fresh random pick for new games.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'games',
        'round_wind',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE games
        ADD CONSTRAINT games_round_wind_range CHECK (round_wind BETWEEN 1 AND 4);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE games DROP CONSTRAINT IF EXISTS games_round_wind_range;`,
        { transaction },
      );
      await queryInterface.removeColumn('games', 'round_wind', { transaction });
    });
  },
};
