'use strict';

/**
 * Three visibility phases for the tile-slot reveal cadence
 * (phase 0 → slot 0, phase 1 → slot 1, phase 2 → slot 2) once
 * `slots_per_node === visibility_phase_count`.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `
      UPDATE map_templates
      SET
        default_visibility_phase_count = 3,
        default_slots_per_node = 1,
        default_dead_wall_size = 0,
        default_visibility_mode = 'both',
        default_slot_unlock_offsets_seconds = ARRAY[0]::INTEGER[],
        default_slot_map_visible = ARRAY[true]::BOOLEAN[],
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
        default_visibility_phase_count = 4,
        updated_at = CURRENT_TIMESTAMP
      WHERE name = 'TTC 2026';
      `,
    );
  },
};
