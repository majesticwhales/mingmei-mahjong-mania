'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('challenge_types', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      resolver_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
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

    await queryInterface.createTable('challenge_decks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.createTable('challenges', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      challenge_deck_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'challenge_decks', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      challenge_type_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'challenge_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(256),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
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

    await queryInterface.createTable('game_challenge_instances', {
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
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      challenge_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'challenges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'active',
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      resolution_payload: {
        type: Sequelize.JSONB,
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

    await queryInterface.createTable('game_challenge_submissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_challenge_instance_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_challenge_instances', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      submitted_by_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      media_asset_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'media_assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: Sequelize.TEXT,
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

    await queryInterface.sequelize.query(`
      ALTER TABLE game_challenge_instances
      ADD CONSTRAINT game_challenge_instances_status_check
      CHECK (status IN ('active', 'submitted', 'approved', 'rejected', 'cancelled'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_challenge_submissions
      ADD CONSTRAINT game_challenge_submissions_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected'));
    `);

    await queryInterface.addIndex('challenge_decks', ['is_active', 'sort_order']);

    await queryInterface.addIndex('challenges', ['challenge_deck_id']);
    await queryInterface.addIndex('challenges', ['challenge_type_id']);
    await queryInterface.addIndex('challenges', ['challenge_deck_id', 'code'], {
      unique: true,
      name: 'challenges_deck_code_unique',
    });

    await queryInterface.addIndex('game_challenge_instances', ['game_id']);
    await queryInterface.addIndex('game_challenge_instances', ['game_team_id']);
    await queryInterface.addIndex('game_challenge_instances', ['game_id', 'status']);

    await queryInterface.addIndex(
      'game_challenge_submissions',
      ['game_challenge_instance_id'],
    );
    await queryInterface.addIndex('game_challenge_submissions', ['submitted_by_user_id']);
    await queryInterface.addIndex('game_challenge_submissions', ['media_asset_id']);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE game_challenge_submissions
      DROP CONSTRAINT IF EXISTS game_challenge_submissions_status_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_challenge_instances
      DROP CONSTRAINT IF EXISTS game_challenge_instances_status_check;
    `);

    await queryInterface.removeIndex('game_challenge_submissions', ['media_asset_id']);
    await queryInterface.removeIndex('game_challenge_submissions', ['submitted_by_user_id']);
    await queryInterface.removeIndex(
      'game_challenge_submissions',
      ['game_challenge_instance_id'],
    );
    await queryInterface.dropTable('game_challenge_submissions');

    await queryInterface.removeIndex('game_challenge_instances', ['game_id', 'status']);
    await queryInterface.removeIndex('game_challenge_instances', ['game_team_id']);
    await queryInterface.removeIndex('game_challenge_instances', ['game_id']);
    await queryInterface.dropTable('game_challenge_instances');

    await queryInterface.removeIndex('challenges', 'challenges_deck_code_unique');
    await queryInterface.removeIndex('challenges', ['challenge_type_id']);
    await queryInterface.removeIndex('challenges', ['challenge_deck_id']);
    await queryInterface.dropTable('challenges');

    await queryInterface.removeIndex('challenge_decks', ['is_active', 'sort_order']);
    await queryInterface.dropTable('challenge_decks');

    await queryInterface.dropTable('challenge_types');
  },
};
