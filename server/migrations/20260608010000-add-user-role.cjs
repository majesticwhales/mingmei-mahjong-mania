'use strict';

/**
 * Add `users.role` — coarse account type used for admin gating.
 *
 *   - `user`  - default for every existing and newly registered account.
 *   - `admin` - elevated account that may access admin-only surfaces.
 *
 * Stored as `VARCHAR(8) NOT NULL DEFAULT 'user'` with a CHECK constraint
 * pinning the allowed values, matching the project's convention for
 * small string enums (see e.g. `20260607000000-add-visibility-mode.cjs`).
 * Every existing row backfills to `'user'`, so this migration is
 * behaviour-neutral on its own — promotion of specific accounts to
 * `'admin'` is left to a manual data step.
 */

const ENUM_VALUES = ['user', 'admin'];
const ENUM_LITERAL = ENUM_VALUES.map((v) => `'${v}'`).join(', ');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'users',
        'role',
        {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'user',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN (${ENUM_LITERAL}));
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('users', 'role', { transaction });
    });
  },
};
