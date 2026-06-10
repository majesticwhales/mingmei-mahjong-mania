'use strict';

/**
 * Remove the experimental `users.is_admin` boolean column.
 *
 * Admin gating uses `users.role` (`20260608010000-add-user-role.cjs`).
 * The `is_admin` migration was never merged to main / never ran on prod,
 * but some local databases applied it during branch work. This migration
 * is safe everywhere: `DROP COLUMN IF EXISTS` is a no-op on prod.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE users DROP COLUMN IF EXISTS is_admin;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        DELETE FROM "SequelizeMeta"
        WHERE name = '20260609120000-add-user-is-admin.cjs';
        `,
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
          AND table_name = 'users'
          AND column_name = 'is_admin'
        LIMIT 1;
        `,
        { transaction },
      );
      if (rows.length > 0) {
        return;
      }
      await queryInterface.addColumn(
        'users',
        'is_admin',
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
