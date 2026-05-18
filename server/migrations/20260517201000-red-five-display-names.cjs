'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const updates = [
      { suit: 'man', label: 'Man' },
      { suit: 'pin', label: 'Pin' },
      { suit: 'sou', label: 'Sou' },
    ];

    for (const { suit, label } of updates) {
      await queryInterface.sequelize.query(
        `
        UPDATE tile_types
        SET display_name = :displayName, updated_at = CURRENT_TIMESTAMP
        WHERE suit = :suit AND rank = 5 AND copy_index = 0
        `,
        {
          replacements: { suit, displayName: `Red 5 ${label}` },
        },
      );
    }
  },

  async down(queryInterface) {
    const updates = [
      { suit: 'man', label: 'Man' },
      { suit: 'pin', label: 'Pin' },
      { suit: 'sou', label: 'Sou' },
    ];

    for (const { suit, label } of updates) {
      await queryInterface.sequelize.query(
        `
        UPDATE tile_types
        SET display_name = :displayName, updated_at = CURRENT_TIMESTAMP
        WHERE suit = :suit AND rank = 5 AND copy_index = 0
        `,
        {
          replacements: { suit, displayName: `5 ${label}` },
        },
      );
    }
  },
};
