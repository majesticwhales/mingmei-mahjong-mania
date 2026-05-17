'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('games', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lobby_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'lobbies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      map_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'active',
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      ends_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      hand_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 13,
      },
      visibility_phase: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      visibility_phase_interval_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      config_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
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

    await queryInterface.createTable('game_teams', {
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
      team_definition_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'team_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      display_name: {
        type: Sequelize.STRING(64),
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

    await queryInterface.createTable('game_participants', {
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
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_team_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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

    await queryInterface.addIndex('games', ['status']);
    await queryInterface.addIndex('games', ['ends_at']);

    await queryInterface.addIndex('game_teams', ['game_id']);
    await queryInterface.addIndex('game_teams', ['game_id', 'team_definition_id'], {
      unique: true,
      name: 'game_teams_game_team_definition_unique',
    });

    await queryInterface.addIndex('game_participants', ['game_id']);
    await queryInterface.addIndex('game_participants', ['user_id']);
    await queryInterface.addIndex('game_participants', ['game_team_id']);
    await queryInterface.addIndex('game_participants', ['game_id', 'user_id'], {
      unique: true,
      name: 'game_participants_game_user_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'game_participants',
      'game_participants_game_user_unique',
    );
    await queryInterface.removeIndex('game_participants', ['game_team_id']);
    await queryInterface.removeIndex('game_participants', ['user_id']);
    await queryInterface.removeIndex('game_participants', ['game_id']);
    await queryInterface.dropTable('game_participants');

    await queryInterface.removeIndex(
      'game_teams',
      'game_teams_game_team_definition_unique',
    );
    await queryInterface.removeIndex('game_teams', ['game_id']);
    await queryInterface.dropTable('game_teams');

    await queryInterface.removeIndex('games', ['ends_at']);
    await queryInterface.removeIndex('games', ['status']);
    await queryInterface.dropTable('games');
  },
};
