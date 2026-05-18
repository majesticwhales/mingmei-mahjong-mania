'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_tiles', {
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
      tile_type_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'tile_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      copy_index: {
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

    await queryInterface.createTable('game_tile_placements', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_tile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'game_tiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_node_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_team_id: {
        type: Sequelize.UUID,
        allowNull: true,
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

    await queryInterface.sequelize.query(`
      ALTER TABLE game_tile_placements
      ADD CONSTRAINT game_tile_placements_node_xor_team
      CHECK (
        (game_node_id IS NOT NULL AND game_team_id IS NULL)
        OR (game_node_id IS NULL AND game_team_id IS NOT NULL)
      );
    `);

    await queryInterface.addIndex('game_tiles', ['game_id']);
    await queryInterface.addIndex('game_tiles', ['game_id', 'tile_type_id', 'copy_index'], {
      unique: true,
      name: 'game_tiles_game_type_copy_unique',
    });

    await queryInterface.addIndex('game_tile_placements', ['game_node_id'], {
      unique: true,
      name: 'game_tile_placements_game_node_id_unique',
    });
    await queryInterface.addIndex('game_tile_placements', ['game_team_id']);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE game_tile_placements
      DROP CONSTRAINT IF EXISTS game_tile_placements_node_xor_team;
    `);

    await queryInterface.removeIndex(
      'game_tile_placements',
      'game_tile_placements_game_node_id_unique',
    );
    await queryInterface.removeIndex('game_tile_placements', ['game_team_id']);
    await queryInterface.dropTable('game_tile_placements');

    await queryInterface.removeIndex('game_tiles', 'game_tiles_game_type_copy_unique');
    await queryInterface.removeIndex('game_tiles', ['game_id']);
    await queryInterface.dropTable('game_tiles');
  },
};
