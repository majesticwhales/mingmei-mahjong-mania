'use strict';

/**
 * Per-slot visibility rules (chunk 5 of 6): enforce array-length / slot-0
 * invariants on the slot-shaped config columns now that the lobby flow
 * keeps them in lockstep with `slots_per_node`.
 *
 * On each of `map_templates`, `lobbies`, `games` we add three CHECKs:
 *
 *   1. `cardinality(<arr>) = <slots_per_node>` — arrays match the slot
 *      count one-to-one.
 *   2. `<arr>[1] = 0` (offsets) / `<arr>[1] = TRUE` (visibility) — slot 0
 *      is always unlocked / always follows phase rules. Postgres arrays
 *      are 1-indexed, so `[1]` is our 0-indexed slot 0.
 *   3. (offsets only) `0 <= ALL(<arr>)` — every offset is non-negative.
 *
 * The upper bound on individual offset values is intentionally NOT in the
 * CHECK; we only require non-negativity and let game-duration sanity
 * remain an app-level concern.
 *
 * Pre-existing data is safe to migrate:
 *
 *   - Chunk 1 backfilled `[0]` / `[true]` defaults paired with the
 *     existing `slots_per_node = 1` rows, so cardinality already matches.
 *   - Slot 0 entries are `0` / `true` by the column DEFAULT.
 *
 * Wrapped in a single transaction.
 */

const TABLES = [
  {
    table: 'map_templates',
    slotsCol: 'default_slots_per_node',
    offsetsCol: 'default_slot_unlock_offsets_seconds',
    visibilityCol: 'default_slot_map_visible',
    namePrefix: 'map_templates_default',
  },
  {
    table: 'lobbies',
    slotsCol: 'slots_per_node',
    offsetsCol: 'slot_unlock_offsets_seconds',
    visibilityCol: 'slot_map_visible',
    namePrefix: 'lobbies',
  },
  {
    table: 'games',
    slotsCol: 'slots_per_node',
    offsetsCol: 'slot_unlock_offsets_seconds',
    visibilityCol: 'slot_map_visible',
    namePrefix: 'games',
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const t of TABLES) {
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_unlock_offsets_cardinality_check
          CHECK (cardinality(${t.offsetsCol}) = ${t.slotsCol});
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_unlock_offsets_slot0_zero_check
          CHECK (${t.offsetsCol}[1] = 0);
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_unlock_offsets_nonneg_check
          CHECK (0 <= ALL(${t.offsetsCol}));
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_map_visible_cardinality_check
          CHECK (cardinality(${t.visibilityCol}) = ${t.slotsCol});
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_map_visible_slot0_true_check
          CHECK (${t.visibilityCol}[1] = TRUE);
          `,
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const t of TABLES) {
        for (const suffix of [
          'slot_map_visible_slot0_true_check',
          'slot_map_visible_cardinality_check',
          'slot_unlock_offsets_nonneg_check',
          'slot_unlock_offsets_slot0_zero_check',
          'slot_unlock_offsets_cardinality_check',
        ]) {
          await queryInterface.sequelize.query(
            `
            ALTER TABLE ${t.table}
            DROP CONSTRAINT IF EXISTS ${t.namePrefix}_${suffix};
            `,
            { transaction },
          );
        }
      }
    });
  },
};
