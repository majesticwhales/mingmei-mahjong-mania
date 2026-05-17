'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('map_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      default_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      default_hand_size: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 13,
      },
      node_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 84,
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

    await queryInterface.createTable('map_template_nodes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      map_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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

    await queryInterface.createTable('map_template_edges', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      map_template_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      from_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      to_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_nodes', key: 'id' },
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

    await queryInterface.addIndex('map_template_nodes', ['map_template_id']);
    await queryInterface.addIndex('map_template_nodes', ['map_template_id', 'code'], {
      unique: true,
      name: 'map_template_nodes_template_id_code_unique',
    });

    await queryInterface.addIndex('map_template_edges', ['map_template_id']);
    await queryInterface.addIndex('map_template_edges', ['from_node_id']);
    await queryInterface.addIndex('map_template_edges', ['to_node_id']);
    await queryInterface.addIndex(
      'map_template_edges',
      ['map_template_id', 'from_node_id', 'to_node_id'],
      {
        unique: true,
        name: 'map_template_edges_template_from_to_unique',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('map_template_edges');
    await queryInterface.dropTable('map_template_nodes');
    await queryInterface.dropTable('map_templates');
  },
};
