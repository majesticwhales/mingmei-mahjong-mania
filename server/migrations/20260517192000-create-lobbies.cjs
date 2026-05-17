'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('lobbies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      host_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'waiting',
      },
      map_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      game_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      visibility_phase_interval_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      team_assignment_mode: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pick',
      },
      min_players_to_start: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 4,
      },
      config_updated_at: {
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

    await queryInterface.createTable('lobby_members', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lobby_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'lobbies', key: 'id' },
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
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

    await queryInterface.createTable('lobby_team_assignments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lobby_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'lobbies', key: 'id' },
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
      team_slot: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex('lobbies', ['host_user_id']);
    await queryInterface.addIndex('lobbies', ['status']);

    await queryInterface.addIndex('lobby_members', ['lobby_id']);
    await queryInterface.addIndex('lobby_members', ['user_id']);
    await queryInterface.addIndex('lobby_members', ['lobby_id', 'user_id'], {
      unique: true,
      name: 'lobby_members_lobby_user_unique',
    });

    await queryInterface.addIndex('lobby_team_assignments', ['lobby_id']);
    await queryInterface.addIndex('lobby_team_assignments', ['user_id']);
    await queryInterface.addIndex('lobby_team_assignments', ['lobby_id', 'user_id'], {
      unique: true,
      name: 'lobby_team_assignments_lobby_user_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'lobby_team_assignments',
      'lobby_team_assignments_lobby_user_unique',
    );
    await queryInterface.removeIndex('lobby_team_assignments', ['user_id']);
    await queryInterface.removeIndex('lobby_team_assignments', ['lobby_id']);
    await queryInterface.dropTable('lobby_team_assignments');

    await queryInterface.removeIndex('lobby_members', 'lobby_members_lobby_user_unique');
    await queryInterface.removeIndex('lobby_members', ['user_id']);
    await queryInterface.removeIndex('lobby_members', ['lobby_id']);
    await queryInterface.dropTable('lobby_members');

    await queryInterface.removeIndex('lobbies', ['status']);
    await queryInterface.removeIndex('lobbies', ['host_user_id']);
    await queryInterface.dropTable('lobbies');
  },
};
