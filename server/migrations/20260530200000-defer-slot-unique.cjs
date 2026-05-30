'use strict';

/**
 * Per-slot visibility rules (chunk 6 follow-up): the partial unique index
 * added in chunk 2 (`game_tile_placements_node_slot_unique`) is a UNIQUE
 * INDEX, not a UNIQUE CONSTRAINT, so it cannot be `DEFERRABLE`. The chunk
 * 3 `swapPlacements` implementation uses a single `UPDATE` to swap two
 * rows' `(game_node_id, slot_index)` atomically — but Postgres checks
 * unique-index violations per-row immediately, not at statement end. The
 * intermediate state (one row already moved, the other not yet) trips the
 * index for any swap whose old and new `(node, slot)` pairs cross over.
 *
 * Fix: replace the partial UNIQUE INDEX with a partial EXCLUDE CONSTRAINT
 * with the same semantics, declared `DEFERRABLE INITIALLY DEFERRED`.
 * EXCLUDE constraints support both partial (`WHERE`) and deferral; the
 * `=` operator on b-tree indexes gives the same uniqueness semantics
 * (`btree` index method on EXCLUDE has been supported natively since
 * Postgres 9.5, so no extension is required).
 *
 * `node_xor_team` CHECK is left as-is. `swapPlacements` sets `node_id` and
 * `slot_index` together on every row, so XOR is never transiently
 * violated and doesn't need to be deferred.
 *
 * Wrapped in a single transaction; idempotent across re-runs via
 * `IF EXISTS` / `IF NOT EXISTS`-style guards (we drop the old index
 * unconditionally — sequelize-cli won't replay an already-applied
 * migration).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS game_tile_placements_node_slot_unique;`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        ADD CONSTRAINT game_tile_placements_node_slot_unique
        EXCLUDE USING btree (game_node_id WITH =, slot_index WITH =)
        WHERE (game_node_id IS NOT NULL)
        DEFERRABLE INITIALLY DEFERRED;
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_tile_placements
        DROP CONSTRAINT IF EXISTS game_tile_placements_node_slot_unique;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        CREATE UNIQUE INDEX game_tile_placements_node_slot_unique
        ON game_tile_placements (game_node_id, slot_index)
        WHERE game_node_id IS NOT NULL;
        `,
        { transaction },
      );
    });
  },
};
