'use strict';

/**
 * TTC 2026 deal layout: 23 tile stations × 3 slots + 4 × 13 hands + 15 dead wall = 136.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE map_templates
      SET
        default_slots_per_node = 3,
        default_dead_wall_size = 15,
        default_visibility_phase_count = 3,
        default_slot_unlock_offsets_seconds = ARRAY[0, 0, 0]::INTEGER[],
        default_slot_map_visible = ARRAY[true, true, true]::BOOLEAN[],
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
        default_slots_per_node = 1,
        default_dead_wall_size = 0,
        default_slot_unlock_offsets_seconds = ARRAY[0]::INTEGER[],
        default_slot_map_visible = ARRAY[true]::BOOLEAN[],
        updated_at = CURRENT_TIMESTAMP
      WHERE name = 'TTC 2026';
      `,
    );
  },
};
