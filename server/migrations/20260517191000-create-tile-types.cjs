'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tile_types', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      suit: {
        type: Sequelize.STRING(32),
        allowNull: false,
      },
      rank: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      copy_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      suit_sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      display_name: {
        type: Sequelize.STRING(64),
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

    await queryInterface.addIndex('tile_types', ['suit', 'rank', 'copy_index'], {
      unique: true,
      name: 'tile_types_suit_rank_copy_unique',
    });
    await queryInterface.addIndex('tile_types', ['suit_sort_order', 'rank', 'copy_index'], {
      name: 'tile_types_sort_order',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('tile_types', 'tile_types_sort_order');
    await queryInterface.removeIndex('tile_types', 'tile_types_suit_rank_copy_unique');
    await queryInterface.dropTable('tile_types');
  },
};
