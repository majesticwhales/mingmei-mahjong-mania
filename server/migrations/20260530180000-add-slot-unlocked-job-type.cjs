'use strict';

/**
 * Per-slot visibility rules (chunk 4 of 6): introduce the `SLOT_UNLOCKED`
 * scheduled-job type.
 *
 * `game_scheduled_jobs.job_type` is a STRING(32) gated by a CHECK
 * enumeration (`VISIBILITY_PHASE_ADVANCE`, `GAME_END`, `NOTIFICATION` — see
 * `20260517197000-create-game-events-and-queue.cjs`). Adding a fourth value
 * requires dropping and re-adding the CHECK; this migration does that
 * inside a transaction.
 *
 * No data migration: pre-existing jobs are unaffected; no new jobs of this
 * type exist until `game-start-service` seeds them on the next game start.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        DROP CONSTRAINT IF EXISTS game_scheduled_jobs_job_type_check;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        ADD CONSTRAINT game_scheduled_jobs_job_type_check
        CHECK (job_type IN (
          'VISIBILITY_PHASE_ADVANCE',
          'GAME_END',
          'NOTIFICATION',
          'SLOT_UNLOCKED'
        ));
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Reject rollback if any SLOT_UNLOCKED rows exist; the legacy CHECK
      // would silently corrupt the catalog by leaving those rows in place
      // but unreadable to the original type set.
      const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS n FROM game_scheduled_jobs WHERE job_type = 'SLOT_UNLOCKED';`,
        { transaction },
      );
      if ((rows[0]?.n ?? 0) > 0) {
        throw new Error(
          'Cannot rollback: SLOT_UNLOCKED jobs exist in game_scheduled_jobs. Delete or remap them first.',
        );
      }

      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        DROP CONSTRAINT IF EXISTS game_scheduled_jobs_job_type_check;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        ADD CONSTRAINT game_scheduled_jobs_job_type_check
        CHECK (job_type IN ('VISIBILITY_PHASE_ADVANCE', 'GAME_END', 'NOTIFICATION'));
        `,
        { transaction },
      );
    });
  },
};
