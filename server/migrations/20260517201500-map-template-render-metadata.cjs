'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('map_template_nodes', 'label_rotate', {
      type: Sequelize.DOUBLE,
      allowNull: true,
    });

    await queryInterface.addColumn('game_nodes', 'label_rotate', {
      type: Sequelize.DOUBLE,
      allowNull: true,
    });

    await queryInterface.addColumn('map_template_lines', 'short_name', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    await queryInterface.addColumn('map_template_lines', 'color', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });

    await queryInterface.addColumn('map_template_lines', 'render_metadata', {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addColumn('game_lines', 'short_name', {
      type: Sequelize.STRING(32),
      allowNull: true,
    });

    await queryInterface.addColumn('game_lines', 'color', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });

    await queryInterface.addColumn('game_lines', 'render_metadata', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('game_lines', 'render_metadata');
    await queryInterface.removeColumn('game_lines', 'color');
    await queryInterface.removeColumn('game_lines', 'short_name');

    await queryInterface.removeColumn('map_template_lines', 'render_metadata');
    await queryInterface.removeColumn('map_template_lines', 'color');
    await queryInterface.removeColumn('map_template_lines', 'short_name');

    await queryInterface.removeColumn('game_nodes', 'label_rotate');
    await queryInterface.removeColumn('map_template_nodes', 'label_rotate');
  },
};
