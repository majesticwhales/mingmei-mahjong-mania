'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('map_template_lines', {
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
        allowNull: true,
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

    await queryInterface.createTable('map_template_node_lines', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      map_template_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      map_template_line_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_lines', key: 'id' },
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

    await queryInterface.createTable('game_lines', {
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
      template_line_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'map_template_lines', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: true,
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

    await queryInterface.createTable('game_node_lines', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      game_node_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_nodes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      game_line_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'game_lines', key: 'id' },
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

    await queryInterface.addIndex('map_template_lines', ['map_template_id']);
    await queryInterface.addIndex('map_template_lines', ['map_template_id', 'code'], {
      unique: true,
      name: 'map_template_lines_template_code_unique',
    });

    await queryInterface.addIndex(
      'map_template_node_lines',
      ['map_template_node_id', 'map_template_line_id'],
      {
        unique: true,
        name: 'map_template_node_lines_node_line_unique',
      },
    );
    await queryInterface.addIndex('map_template_node_lines', ['map_template_line_id']);

    await queryInterface.addIndex('game_lines', ['game_id']);
    await queryInterface.addIndex('game_lines', ['game_id', 'code'], {
      unique: true,
      name: 'game_lines_game_code_unique',
    });
    await queryInterface.addIndex('game_lines', ['template_line_id']);

    await queryInterface.addIndex('game_node_lines', ['game_node_id']);
    await queryInterface.addIndex('game_node_lines', ['game_node_id', 'game_line_id'], {
      unique: true,
      name: 'game_node_lines_node_line_unique',
    });
    await queryInterface.addIndex('game_node_lines', ['game_line_id']);

    await queryInterface.removeColumn('map_template_nodes', 'line_id');
    await queryInterface.removeColumn('game_nodes', 'line_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('map_template_nodes', 'line_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('game_nodes', 'line_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.removeIndex('game_node_lines', 'game_node_lines_node_line_unique');
    await queryInterface.removeIndex('game_node_lines', ['game_line_id']);
    await queryInterface.removeIndex('game_node_lines', ['game_node_id']);
    await queryInterface.dropTable('game_node_lines');

    await queryInterface.removeIndex('game_lines', 'game_lines_game_code_unique');
    await queryInterface.removeIndex('game_lines', ['template_line_id']);
    await queryInterface.removeIndex('game_lines', ['game_id']);
    await queryInterface.dropTable('game_lines');

    await queryInterface.removeIndex(
      'map_template_node_lines',
      'map_template_node_lines_node_line_unique',
    );
    await queryInterface.removeIndex('map_template_node_lines', ['map_template_line_id']);
    await queryInterface.dropTable('map_template_node_lines');

    await queryInterface.removeIndex(
      'map_template_lines',
      'map_template_lines_template_code_unique',
    );
    await queryInterface.removeIndex('map_template_lines', ['map_template_id']);
    await queryInterface.dropTable('map_template_lines');
  },
};
