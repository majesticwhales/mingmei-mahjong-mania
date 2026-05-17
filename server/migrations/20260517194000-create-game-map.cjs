'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('game_nodes', {
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
      template_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      latitude: {
        type: Sequelize.DOUBLE,
        allowNull: false,
      },
      longitude: {
        type: Sequelize.DOUBLE,
        allowNull: false,
      },
      geofence_radius_meters: {
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

    await queryInterface.createTable('game_edges', {
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
      from_game_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      to_game_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      weight: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      travel_seconds: {
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

    await queryInterface.addIndex('game_nodes', ['game_id']);
    await queryInterface.addIndex('game_nodes', ['template_node_id']);
    await queryInterface.addIndex('game_nodes', ['game_id', 'code'], {
      unique: true,
      name: 'game_nodes_game_id_code_unique',
    });

    await queryInterface.addIndex('game_edges', ['game_id']);
    await queryInterface.addIndex('game_edges', ['from_game_node_id']);
    await queryInterface.addIndex('game_edges', ['to_game_node_id']);
    await queryInterface.addIndex(
      'game_edges',
      ['game_id', 'from_game_node_id', 'to_game_node_id'],
      {
        unique: true,
        name: 'game_edges_game_from_to_unique',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('game_edges', 'game_edges_game_from_to_unique');
    await queryInterface.removeIndex('game_edges', ['to_game_node_id']);
    await queryInterface.removeIndex('game_edges', ['from_game_node_id']);
    await queryInterface.removeIndex('game_edges', ['game_id']);
    await queryInterface.dropTable('game_edges');

    await queryInterface.removeIndex('game_nodes', 'game_nodes_game_id_code_unique');
    await queryInterface.removeIndex('game_nodes', ['template_node_id']);
    await queryInterface.removeIndex('game_nodes', ['game_id']);
    await queryInterface.dropTable('game_nodes');
  },
};
