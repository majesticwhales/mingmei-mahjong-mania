'use strict';

/**
 * Follow-up to 20260524000000-relax-abstraction-layer: relax the legacy
 * "exactly four visibility quarters, every team gets a unique home"
 * constraints to match the configurable `visibility_phase_count` model.
 *
 * - `game_node_visibility_groups.group_index` now has a `>= 0` lower bound
 *   only; the upper bound (≤ 3) is dropped so games with N > 4 phases work.
 * - `game_team_home_groups.group_index` same fix.
 * - `game_team_home_groups (game_id, group_index)` unique index is dropped
 *   (teams may share home groups when `team_count > visibility_phase_count`,
 *   e.g. all 4 teams sharing group 0 when N = 1). Replaced with a non-unique
 *   index to keep lookups by (game_id, group_index) cheap.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      DROP CONSTRAINT IF EXISTS game_node_visibility_groups_group_index_range;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      ADD CONSTRAINT game_node_visibility_groups_group_index_nonnegative
      CHECK (group_index >= 0);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      DROP CONSTRAINT IF EXISTS game_team_home_groups_group_index_range;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      ADD CONSTRAINT game_team_home_groups_group_index_nonnegative
      CHECK (group_index >= 0);
    `);

    await queryInterface.removeIndex(
      'game_team_home_groups',
      'game_team_home_groups_game_group_unique',
    );
    await queryInterface.addIndex(
      'game_team_home_groups',
      ['game_id', 'group_index'],
      { name: 'game_team_home_groups_game_group_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'game_team_home_groups',
      'game_team_home_groups_game_group_idx',
    );
    await queryInterface.addIndex(
      'game_team_home_groups',
      ['game_id', 'group_index'],
      {
        unique: true,
        name: 'game_team_home_groups_game_group_unique',
      },
    );

    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      DROP CONSTRAINT IF EXISTS game_team_home_groups_group_index_nonnegative;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      ADD CONSTRAINT game_team_home_groups_group_index_range
      CHECK (group_index >= 0 AND group_index <= 3);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      DROP CONSTRAINT IF EXISTS game_node_visibility_groups_group_index_nonnegative;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      ADD CONSTRAINT game_node_visibility_groups_group_index_range
      CHECK (group_index >= 0 AND group_index <= 3);
    `);
  },
};
