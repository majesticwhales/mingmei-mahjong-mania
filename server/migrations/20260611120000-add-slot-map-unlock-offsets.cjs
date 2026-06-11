'use strict';

/**
 * Phase L — server-authoritative tile visibility, chunk 1: split the map
 * reveal timer out of the single-source `slot_unlock_offsets_seconds` and
 * drop the now-redundant `slot_map_visible[]` boolean cap.
 *
 * Today `slot_unlock_offsets_seconds[k]` couples engine-claimability +
 * station-side reveal + map reveal into one timer; `slot_map_visible[k]`
 * layers a static "never on the map" cap on top. The new model splits map
 * reveal onto its own timer so tier-2 (claim now, map later) and tier-3
 * (out-of-play -> claim+station after t1, map after t2) become
 * expressible.
 *
 * Schema swap (atomic, wrapped in a single transaction):
 *
 *   1. ADD `slot_map_unlock_offsets_seconds INTEGER[] NOT NULL DEFAULT
 *      '{0}'::INTEGER[]` on `map_templates` (as `default_…`), `lobbies`,
 *      and `games`. Array elements can be `NULL`, which means "this slot
 *      is never on the map" — folds in the old `slot_map_visible = false`
 *      semantics.
 *
 *   2. BACKFILL existing rows from `(slot_unlock_offsets_seconds,
 *      slot_map_visible)` into the new column using the semantic-
 *      preserving rule:
 *        - `slot_map_visible[k] = TRUE`
 *            → `slot_map_unlock_offsets_seconds[k] = slot_unlock_offsets_seconds[k]`
 *            (map reveals at the same time the slot becomes claimable —
 *            matches the pre-Phase-L behavior where the same offset
 *            governed both).
 *        - `slot_map_visible[k] = FALSE`
 *            → `slot_map_unlock_offsets_seconds[k] = NULL`
 *            (slot never on the map — the new "out of play on map" tier
 *            carries the old boolean cap).
 *      Required because the default `'{0}'` only satisfies the
 *      cardinality CHECK for `slots_per_node = 1` rows; any row with a
 *      wider slots_per_node (notably the TTC 2026 template, which seeds
 *      with `default_slots_per_node = 3`) would trip the cardinality
 *      CHECK in step 3 otherwise.
 *
 *   3. CHECK constraints per pattern from chunk-5
 *      (`20260530190000-add-config-array-checks.cjs`):
 *      - cardinality matches the row's slots-per-node column,
 *      - `[1] = 0` (Postgres 1-indexed; slot 0 is always on-map at start),
 *      - paired CHECK against `slot_unlock_offsets_seconds[i]` to enforce
 *        `map_offset[i] IS NULL OR map_offset[i] >= claim_offset[i]` for
 *        every slot. Postgres forbids subqueries directly in CHECK
 *        constraints, so the per-element comparison is wrapped in an
 *        `IMMUTABLE` SQL function `slot_map_unlock_offsets_monotonic`
 *        that takes both arrays as args.
 *
 *   4. UPDATE `map_templates` to seed the TTC 2026 template's
 *      `default_slot_map_unlock_offsets_seconds = '{0, 3600, 7200}'`
 *      (slot 0 immediately, slot 1 after 1h, slot 2 after 2h). Other
 *      templates fall through on the step-2 backfill.
 *
 *   5. DROP all five existing `slot_map_visible[]` CHECK constraints
 *      (cardinality + slot-0 = true, per table) before removing the
 *      column itself from `map_templates.default_slot_map_visible`,
 *      `lobbies.slot_map_visible`, `games.slot_map_visible`.
 *
 *   6. Extend the `game_scheduled_jobs.job_type` CHECK enum to admit
 *      `SLOT_MAP_UNLOCKED` so the new scheduler handler can run.
 */

const TABLES = [
  {
    table: 'map_templates',
    slotsCol: 'default_slots_per_node',
    claimOffsetsCol: 'default_slot_unlock_offsets_seconds',
    mapOffsetsCol: 'default_slot_map_unlock_offsets_seconds',
    legacyVisibleCol: 'default_slot_map_visible',
    namePrefix: 'map_templates_default',
  },
  {
    table: 'lobbies',
    slotsCol: 'slots_per_node',
    claimOffsetsCol: 'slot_unlock_offsets_seconds',
    mapOffsetsCol: 'slot_map_unlock_offsets_seconds',
    legacyVisibleCol: 'slot_map_visible',
    namePrefix: 'lobbies',
  },
  {
    table: 'games',
    slotsCol: 'slots_per_node',
    claimOffsetsCol: 'slot_unlock_offsets_seconds',
    mapOffsetsCol: 'slot_map_unlock_offsets_seconds',
    legacyVisibleCol: 'slot_map_visible',
    namePrefix: 'games',
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Add the new column on every table. Defaults `{0}` so single-slot
      //    rows (the column default for `slots_per_node`) satisfy
      //    cardinality immediately; existing rows with wider
      //    `slots_per_node` are fixed up in step 2 before any CHECK
      //    constraints land.
      for (const t of TABLES) {
        await queryInterface.addColumn(
          t.table,
          t.mapOffsetsCol,
          {
            type: Sequelize.ARRAY(Sequelize.INTEGER),
            allowNull: false,
            defaultValue: [0],
          },
          { transaction },
        );
      }

      // 2. Backfill existing rows from the legacy
      //    `(slot_unlock_offsets_seconds, slot_map_visible)` pair into the
      //    new column. Translates `slot_map_visible[k]` via:
      //      - TRUE  → `slot_map_unlock_offsets_seconds[k] = slot_unlock_offsets_seconds[k]`
      //        (map reveals coincide with the claim unlock — matches the
      //        pre-Phase-L behavior where the same offset drove both).
      //      - FALSE → `slot_map_unlock_offsets_seconds[k] = NULL`
      //        (slot never on the map; carries the old boolean cap into
      //        the new nullable-element column).
      //    Runs unconditionally — even single-slot rows get rewritten to
      //    a length-1 array (`{0}`), which is a no-op against the default.
      //    Wrapping the value selection in a correlated subquery over
      //    `generate_subscripts` keeps the per-element translation a
      //    single SQL statement per table.
      for (const t of TABLES) {
        await queryInterface.sequelize.query(
          `
          UPDATE ${t.table} AS tgt
          SET ${t.mapOffsetsCol} = sub.new_offsets
          FROM (
            SELECT
              t.id,
              ARRAY(
                SELECT CASE
                  WHEN t.${t.legacyVisibleCol}[idx] THEN t.${t.claimOffsetsCol}[idx]
                  ELSE NULL
                END
                FROM generate_subscripts(t.${t.legacyVisibleCol}, 1) AS idx
                ORDER BY idx
              ) AS new_offsets
            FROM ${t.table} AS t
          ) AS sub
          WHERE tgt.id = sub.id;
          `,
          { transaction },
        );
      }

      // 3a. Helper function for the per-element monotonic CHECK. Postgres
      //     forbids subqueries directly in CHECK constraints, so we wrap
      //     the `generate_subscripts` element-wise comparison in an
      //     IMMUTABLE SQL function. Function takes both arrays as args
      //     (no table refs), which keeps it deterministic and re-runnable
      //     across rows. Drops in `down()`.
      await queryInterface.sequelize.query(
        `
        CREATE OR REPLACE FUNCTION slot_map_unlock_offsets_monotonic(
          map_offsets INTEGER[],
          claim_offsets INTEGER[]
        ) RETURNS BOOLEAN
        LANGUAGE SQL
        IMMUTABLE
        AS $$
          SELECT NOT EXISTS (
            SELECT 1
            FROM generate_subscripts(map_offsets, 1) AS idx
            WHERE map_offsets[idx] IS NOT NULL
              AND map_offsets[idx] < claim_offsets[idx]
          );
        $$;
        `,
        { transaction },
      );

      // 3b. CHECK constraints. Cardinality + slot-0 = 0 mirror the existing
      //     `slot_unlock_offsets_seconds` invariants; the paired
      //     monotonicity CHECK gives us "map reveal can't be earlier than
      //     claim reveal" enforcement at the DB layer, via the helper
      //     function above.
      for (const t of TABLES) {
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_map_unlock_offsets_cardinality_check
          CHECK (cardinality(${t.mapOffsetsCol}) = ${t.slotsCol});
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_map_unlock_offsets_slot0_zero_check
          CHECK (${t.mapOffsetsCol}[1] = 0);
          `,
          { transaction },
        );
        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ADD CONSTRAINT ${t.namePrefix}_slot_map_unlock_offsets_monotonic_check
          CHECK (
            slot_map_unlock_offsets_monotonic(${t.mapOffsetsCol}, ${t.claimOffsetsCol})
          );
          `,
          { transaction },
        );
      }

      // 4. Seed TTC 2026 template defaults directly, overriding the
      //    step-2 backfill (which would otherwise leave it at the
      //    claim-coincident `[0, 2400, 4800]` shape). With
      //    `default_slot_unlock_offsets_seconds = [0, 2400, 4800]` the
      //    monotonicity CHECK is satisfied: 0>=0, 3600>=2400, 7200>=4800.
      await queryInterface.sequelize.query(
        `
        UPDATE map_templates
        SET
          default_slot_map_unlock_offsets_seconds = ARRAY[0, 3600, 7200]::INTEGER[],
          updated_at = CURRENT_TIMESTAMP
        WHERE name = 'TTC 2026';
        `,
        { transaction },
      );

      // 5. Drop the legacy `slot_map_visible[]` column and its CHECKs.
      //    The constraint names match the ones seeded by chunk-5
      //    (`20260530190000-add-config-array-checks.cjs`).
      for (const t of TABLES) {
        for (const suffix of [
          'slot_map_visible_slot0_true_check',
          'slot_map_visible_cardinality_check',
        ]) {
          await queryInterface.sequelize.query(
            `
            ALTER TABLE ${t.table}
            DROP CONSTRAINT IF EXISTS ${t.namePrefix}_${suffix};
            `,
            { transaction },
          );
        }
        await queryInterface.removeColumn(t.table, t.legacyVisibleCol, {
          transaction,
        });
      }

      // 6. Extend the `game_scheduled_jobs.job_type` CHECK enum to admit
      //    `SLOT_MAP_UNLOCKED`. Mirrors the chunk-4
      //    `20260530180000-add-slot-unlocked-job-type.cjs` pattern of
      //    dropping + re-adding the CHECK with the new value folded in.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        DROP CONSTRAINT IF EXISTS game_scheduled_jobs_job_type_check;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        ADD CONSTRAINT game_scheduled_jobs_job_type_check
        CHECK (job_type IN (
          'VISIBILITY_PHASE_ADVANCE',
          'GAME_END',
          'NOTIFICATION',
          'SLOT_UNLOCKED',
          'SLOT_MAP_UNLOCKED'
        ));
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Reject rollback if any SLOT_MAP_UNLOCKED rows exist; the
      // pre-Phase-L CHECK would silently corrupt the catalog by leaving
      // them in place but unreadable to the original type set.
      const [rows] = await queryInterface.sequelize.query(
        `SELECT COUNT(*)::int AS n FROM game_scheduled_jobs WHERE job_type = 'SLOT_MAP_UNLOCKED';`,
        { transaction },
      );
      if ((rows[0]?.n ?? 0) > 0) {
        throw new Error(
          'Cannot rollback: SLOT_MAP_UNLOCKED jobs exist in game_scheduled_jobs. Delete or remap them first.',
        );
      }

      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        DROP CONSTRAINT IF EXISTS game_scheduled_jobs_job_type_check;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_scheduled_jobs
        ADD CONSTRAINT game_scheduled_jobs_job_type_check
        CHECK (job_type IN (
          'VISIBILITY_PHASE_ADVANCE',
          'GAME_END',
          'NOTIFICATION',
          'SLOT_UNLOCKED'
        ));
        `,
        { transaction },
      );

      // Re-add `slot_map_visible[]` and backfill from the inverse of the
      // up() rule:
      //   - `slot_map_unlock_offsets_seconds[k] IS NULL` → FALSE (never on map)
      //   - otherwise                                    → TRUE
      // The column starts nullable + default-less so the addColumn can
      // succeed against rows with `slots_per_node > 1` (the chunk-5
      // cardinality CHECK has been dropped by up(), but a `DEFAULT
      // '{true}'` would still mis-length the array for those rows). We
      // backfill, then flip to NOT NULL.
      //
      // Note: the chunk-5 CHECKs on `slot_map_visible` are NOT re-added.
      // The down() path is for emergency rollback only; re-running the
      // chunk-5 migration is the supported way to restore them.
      for (const t of TABLES) {
        await queryInterface.addColumn(
          t.table,
          t.legacyVisibleCol,
          {
            type: Sequelize.ARRAY(Sequelize.BOOLEAN),
            allowNull: true,
          },
          { transaction },
        );

        await queryInterface.sequelize.query(
          `
          UPDATE ${t.table} AS tgt
          SET ${t.legacyVisibleCol} = sub.new_visible
          FROM (
            SELECT
              t.id,
              ARRAY(
                SELECT (t.${t.mapOffsetsCol}[idx] IS NOT NULL)
                FROM generate_subscripts(t.${t.mapOffsetsCol}, 1) AS idx
                ORDER BY idx
              ) AS new_visible
            FROM ${t.table} AS t
          ) AS sub
          WHERE tgt.id = sub.id;
          `,
          { transaction },
        );

        await queryInterface.sequelize.query(
          `
          ALTER TABLE ${t.table}
          ALTER COLUMN ${t.legacyVisibleCol} SET NOT NULL,
          ALTER COLUMN ${t.legacyVisibleCol} SET DEFAULT ARRAY[true]::BOOLEAN[];
          `,
          { transaction },
        );
      }

      for (const t of TABLES) {
        for (const suffix of [
          'slot_map_unlock_offsets_monotonic_check',
          'slot_map_unlock_offsets_slot0_zero_check',
          'slot_map_unlock_offsets_cardinality_check',
        ]) {
          await queryInterface.sequelize.query(
            `
            ALTER TABLE ${t.table}
            DROP CONSTRAINT IF EXISTS ${t.namePrefix}_${suffix};
            `,
            { transaction },
          );
        }
        await queryInterface.removeColumn(t.table, t.mapOffsetsCol, {
          transaction,
        });
      }

      // Helper function is only referenced by the CHECKs dropped above;
      // safe to remove once every CHECK is gone.
      await queryInterface.sequelize.query(
        `DROP FUNCTION IF EXISTS slot_map_unlock_offsets_monotonic(INTEGER[], INTEGER[]);`,
        { transaction },
      );
    });
  },
};
