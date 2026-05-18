'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_events', {
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
      sequence: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      event_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      actor_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      actor_game_team_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'game_teams', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
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

    await queryInterface.createTable('game_command_queue', {
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
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      command_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
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
      client_command_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      processed_at: {
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

    await queryInterface.createTable('game_scheduled_jobs', {
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
      job_type: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      run_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      error_message: {
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
      ALTER TABLE game_command_queue
      ADD CONSTRAINT game_command_queue_status_check
      CHECK (status IN ('pending', 'processing', 'done', 'failed'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_scheduled_jobs
      ADD CONSTRAINT game_scheduled_jobs_status_check
      CHECK (status IN ('pending', 'processing', 'done', 'failed'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE game_scheduled_jobs
      ADD CONSTRAINT game_scheduled_jobs_job_type_check
      CHECK (job_type IN ('VISIBILITY_PHASE_ADVANCE', 'GAME_END', 'NOTIFICATION'));
    `);

    await queryInterface.addIndex('game_events', ['game_id']);
    await queryInterface.addIndex('game_events', ['game_id', 'sequence'], {
      unique: true,
      name: 'game_events_game_id_sequence_unique',
    });
    await queryInterface.addIndex('game_events', ['game_id', 'created_at']);

    await queryInterface.addIndex('game_command_queue', ['game_id']);
    await queryInterface.addIndex('game_command_queue', ['game_id', 'status', 'created_at'], {
      name: 'game_command_queue_game_status_created',
    });
    await queryInterface.addIndex('game_command_queue', ['game_id', 'client_command_id'], {
      unique: true,
      name: 'game_command_queue_game_client_command_unique',
    });

    await queryInterface.addIndex('game_scheduled_jobs', ['game_id']);
    await queryInterface.addIndex('game_scheduled_jobs', ['status', 'run_at'], {
      name: 'game_scheduled_jobs_status_run_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE game_scheduled_jobs
      DROP CONSTRAINT IF EXISTS game_scheduled_jobs_job_type_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_scheduled_jobs
      DROP CONSTRAINT IF EXISTS game_scheduled_jobs_status_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE game_command_queue
      DROP CONSTRAINT IF EXISTS game_command_queue_status_check;
    `);

    await queryInterface.removeIndex(
      'game_scheduled_jobs',
      'game_scheduled_jobs_status_run_at',
    );
    await queryInterface.removeIndex('game_scheduled_jobs', ['game_id']);
    await queryInterface.dropTable('game_scheduled_jobs');

    await queryInterface.removeIndex(
      'game_command_queue',
      'game_command_queue_game_client_command_unique',
    );
    await queryInterface.removeIndex(
      'game_command_queue',
      'game_command_queue_game_status_created',
    );
    await queryInterface.removeIndex('game_command_queue', ['game_id']);
    await queryInterface.dropTable('game_command_queue');

    await queryInterface.removeIndex('game_events', ['game_id', 'created_at']);
    await queryInterface.removeIndex('game_events', 'game_events_game_id_sequence_unique');
    await queryInterface.removeIndex('game_events', ['game_id']);
    await queryInterface.dropTable('game_events');
  },
};
