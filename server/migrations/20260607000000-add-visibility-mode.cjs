'use strict';

/**
 * Per-game visibility mode (chunk 1 of 5).
 *
 * Adds an explicit knob that selects which of the two existing visibility
 * layers a game uses:
 *
 *   - `none`  - neither layer; every node face-up to every team, every
 *               slot unlocked + map-visible from the start.
 *   - `phase` - node-group phase reveal only (§3.2).
 *   - `slot`  - per-slot unlock + per-slot map-visibility only (§3.3).
 *   - `both`  - both layers active (existing default, preserves
 *               behaviour for every row inserted before this migration).
 *
 * The two layers themselves were already independently configurable via
 * `visibility_phase_count` / `slot_unlock_offsets_seconds` /
 * `slot_map_visible`; the mode column is the host-facing intent +
 * a single place for the engine, scheduler, and projection to branch
 * on. Chunks 2-4 wire the lobby surface, engine, and projection;
 * chunk 5 documents the model.
 *
 * Schema changes (single transaction):
 *
 *   1. `map_templates.default_visibility_mode VARCHAR(8)
 *       NOT NULL DEFAULT 'both'` + CHECK in the enum.
 *
 *   2. `lobbies.visibility_mode VARCHAR(8) NOT NULL DEFAULT 'both'`
 *       + CHECK. Lobbies inherit from `map_templates.default_visibility_mode`
 *       on creation (wired in chunk 2).
 *
 *   3. `games.visibility_mode VARCHAR(8) NOT NULL DEFAULT 'both'`
 *       + CHECK. Snapshotted from `lobbies.visibility_mode` at game start
 *       (wired in chunk 3).
 *
 * Back-compat: every existing row in all three tables defaults to `both`,
 * which exactly reproduces the current behaviour (both layers active),
 * so no in-flight game observes a behaviour change from this migration
 * alone.
 */

const ENUM_VALUES = ['none', 'phase', 'slot', 'both'];
const ENUM_LITERAL = ENUM_VALUES.map((v) => `'${v}'`).join(', ');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. map_templates.default_visibility_mode
      await queryInterface.addColumn(
        'map_templates',
        'default_visibility_mode',
        {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'both',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE map_templates
        ADD CONSTRAINT map_templates_default_visibility_mode_check
        CHECK (default_visibility_mode IN (${ENUM_LITERAL}));
        `,
        { transaction },
      );

      // 2. lobbies.visibility_mode
      await queryInterface.addColumn(
        'lobbies',
        'visibility_mode',
        {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'both',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE lobbies
        ADD CONSTRAINT lobbies_visibility_mode_check
        CHECK (visibility_mode IN (${ENUM_LITERAL}));
        `,
        { transaction },
      );

      // 3. games.visibility_mode
      await queryInterface.addColumn(
        'games',
        'visibility_mode',
        {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'both',
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE games
        ADD CONSTRAINT games_visibility_mode_check
        CHECK (visibility_mode IN (${ENUM_LITERAL}));
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE games DROP CONSTRAINT IF EXISTS games_visibility_mode_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('games', 'visibility_mode', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE lobbies DROP CONSTRAINT IF EXISTS lobbies_visibility_mode_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('lobbies', 'visibility_mode', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE map_templates DROP CONSTRAINT IF EXISTS map_templates_default_visibility_mode_check;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'map_templates',
        'default_visibility_mode',
        { transaction },
      );
    });
  },
};
