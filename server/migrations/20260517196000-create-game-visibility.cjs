'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_team_positions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_team_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      current_game_node_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      checked_in_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_check_in_latitude: {
        type: Sequelize.DOUBLE,
        allowNull: true,
      },
      last_check_in_longitude: {
        type: Sequelize.DOUBLE,
        allowNull: true,
      },
      geofence_validated: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      geolocation_warning: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.createTable('game_node_visibility_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      group_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.createTable('game_team_home_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'games', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_team_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      group_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.createTable('game_location_team_visibility', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_team_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      is_face_up: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      source: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'phase',
      },
      revealed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.createTable('game_rule_flags', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'games', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      rule_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      ADD CONSTRAINT game_node_visibility_groups_group_index_range
      CHECK (group_index >= 0 AND group_index <= 3);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      ADD CONSTRAINT game_team_home_groups_group_index_range
      CHECK (group_index >= 0 AND group_index <= 3);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_location_team_visibility
      ADD CONSTRAINT game_location_team_visibility_source_check
      CHECK (source IN ('phase', 'override'));
    `);

    await queryInterface.addIndex('game_team_positions', ['current_game_node_id']);

    await queryInterface.addIndex('game_node_visibility_groups', ['group_index']);

    await queryInterface.addIndex('game_team_home_groups', ['game_id']);
    await queryInterface.addIndex('game_team_home_groups', ['game_id', 'group_index'], {
      unique: true,
      name: 'game_team_home_groups_game_group_unique',
    });

    await queryInterface.addIndex(
      'game_location_team_visibility',
      ['game_team_id', 'game_node_id'],
      {
        unique: true,
        name: 'game_location_team_visibility_team_node_unique',
      },
    );
    await queryInterface.addIndex('game_location_team_visibility', ['game_team_id']);
    await queryInterface.addIndex('game_location_team_visibility', ['game_node_id']);

    await queryInterface.addIndex('game_rule_flags', ['game_id', 'rule_key'], {
      unique: true,
      name: 'game_rule_flags_game_rule_key_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE game_location_team_visibility
      DROP CONSTRAINT IF EXISTS game_location_team_visibility_source_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_team_home_groups
      DROP CONSTRAINT IF EXISTS game_team_home_groups_group_index_range;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_node_visibility_groups
      DROP CONSTRAINT IF EXISTS game_node_visibility_groups_group_index_range;
    `);

    await queryInterface.removeIndex(
      'game_rule_flags',
      'game_rule_flags_game_rule_key_unique',
    );
    await queryInterface.dropTable('game_rule_flags');

    await queryInterface.removeIndex(
      'game_location_team_visibility',
      'game_location_team_visibility_team_node_unique',
    );
    await queryInterface.removeIndex('game_location_team_visibility', ['game_node_id']);
    await queryInterface.removeIndex('game_location_team_visibility', ['game_team_id']);
    await queryInterface.dropTable('game_location_team_visibility');

    await queryInterface.removeIndex(
      'game_team_home_groups',
      'game_team_home_groups_game_group_unique',
    );
    await queryInterface.removeIndex('game_team_home_groups', ['game_id']);
    await queryInterface.dropTable('game_team_home_groups');

    await queryInterface.removeIndex('game_node_visibility_groups', ['group_index']);
    await queryInterface.dropTable('game_node_visibility_groups');

    await queryInterface.removeIndex('game_team_positions', ['current_game_node_id']);
    await queryInterface.dropTable('game_team_positions');
  },
};
