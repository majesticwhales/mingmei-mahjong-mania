'use strict';

/**
 * Drop the now-unused `game_team_positions.credit_earned_in_session`
 * column. The "one swap per check-in session" cap it enforced has been
 * subsumed by the station-wide challenge cooldown
 * (`game_challenge_instances.cooldown_until`) — a team that completes
 * a challenge cannot start another one at the same station until the
 * cooldown elapses, which is the only rate-limit we need. See
 * [§3.8](#38-challenges-honor-system-swap-gate) in TDD_server.md.
 *
 * `pending_swap_credit` stays — it remains the per-completion link
 * between `CHALLENGE_COMPLETED` and the credit-consuming `SWAP_TILE` /
 * `CLAIM_WIN` (one challenge → one swap reward).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE game_team_positions DROP COLUMN IF EXISTS credit_earned_in_session;`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'game_team_positions'
          AND column_name = 'credit_earned_in_session'
        LIMIT 1;
        `,
        { transaction },
      );
      if (rows.length > 0) {
        return;
      }
      await queryInterface.addColumn(
        'game_team_positions',
        'credit_earned_in_session',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );
    });
  },
};
