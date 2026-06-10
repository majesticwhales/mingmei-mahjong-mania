'use strict';

/**
 * Slot 0 at game start; slots 1 and 2 unlock at 1/3 and 2/3 of game duration.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE map_templates
      SET
        default_visibility_mode = 'slot',
        default_slot_unlock_offsets_seconds = ARRAY[
          0,
          default_duration_seconds / 3,
          2 * default_duration_seconds / 3
        ]::INTEGER[],
        updated_at = CURRENT_TIMESTAMP
      WHERE name = 'TTC 2026';
      `,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE map_templates
      SET
        default_visibility_mode = 'both',
        default_slot_unlock_offsets_seconds = ARRAY[0, 0, 0]::INTEGER[],
        updated_at = CURRENT_TIMESTAMP
      WHERE name = 'TTC 2026';
      `,
    );
  },
};
