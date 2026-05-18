'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media_assets', {
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
      purpose: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      storage_key: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      content_type: {
        type: Sequelize.STRING(128),
        allowNull: true,
      },
      byte_size: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      deleted_at: {
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

    await queryInterface.sequelize.query(`
      ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_purpose_check
      CHECK (purpose IN ('check_in', 'challenge_submission', 'other'));
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE media_assets
      ADD CONSTRAINT media_assets_status_check
      CHECK (status IN ('pending', 'ready', 'failed'));
    `);

    await queryInterface.addIndex('media_assets', ['game_id']);
    await queryInterface.addIndex('media_assets', ['user_id']);
    await queryInterface.addIndex('media_assets', ['status']);
    await queryInterface.addIndex('media_assets', ['expires_at']);
    await queryInterface.addIndex('media_assets', ['storage_key'], {
      unique: true,
      name: 'media_assets_storage_key_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE media_assets
      DROP CONSTRAINT IF EXISTS media_assets_status_check;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE media_assets
      DROP CONSTRAINT IF EXISTS media_assets_purpose_check;
    `);

    await queryInterface.removeIndex('media_assets', 'media_assets_storage_key_unique');
    await queryInterface.removeIndex('media_assets', ['expires_at']);
    await queryInterface.removeIndex('media_assets', ['status']);
    await queryInterface.removeIndex('media_assets', ['user_id']);
    await queryInterface.removeIndex('media_assets', ['game_id']);
    await queryInterface.dropTable('media_assets');
  },
};
