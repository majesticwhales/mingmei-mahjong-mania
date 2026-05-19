'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('map_templates', 'default_start_node_code', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('lobbies', 'default_start_node_code', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('lobbies', 'default_start_node_code');
    await queryInterface.removeColumn('map_templates', 'default_start_node_code');
  },
};
