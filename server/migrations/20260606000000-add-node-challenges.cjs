'use strict';

/**
 * Node challenge wiring (Phase H chunk 1 of 5).
 *
 * Honor-system challenges that gate `SWAP_TILE` at a station. Each map
 * template node carries an ordered queue of challenges; the queue is
 * snapshotted to a per-game table at game start. Per-team progress is
 * recorded on `game_challenge_instances` (already exists from the Phase H
 * schema migration); a single-use, per-check-in "swap credit" is tracked
 * on `game_team_positions`.
 *
 * MVP: at most one challenge per node; the "top of queue" mechanic and
 * discard logic are deferred but the schema supports an N-deep queue.
 *
 * Schema changes (single transaction):
 *
 *   1. `map_template_node_challenges`:
 *      - Ordered queue per map template node. (`map_template_node_id`,
 *        `challenge_id`, `sort_order`). Unique on
 *        (`map_template_node_id`, `sort_order`) so callers cannot stuff
 *        two challenges into the same slot.
 *
 *   2. `game_node_challenges`:
 *      - Per-game snapshot of (1). Created at game start; populated by
 *        `GameStartService` in chunk 2. Same unique on
 *        (`game_node_id`, `sort_order`).
 *
 *   3. `challenges.flavor_text TEXT NULL`:
 *      - Third copy field alongside `title` and `description`, per
 *        product spec ("title, flavour text, and description").
 *
 *   4. `game_challenge_instances`:
 *      - Add `game_node_challenge_id` FK -> `game_node_challenges`
 *        (NOT NULL, CASCADE on delete). Required so we can answer "what
 *        is this team's most recent attempt at THIS node's top challenge?"
 *      - Add `cooldown_until TIMESTAMPTZ NULL`. Stamped on resolution
 *        (`completed` or `failed`) by the handlers in chunk 3.
 *      - Replace the existing status CHECK to add `in_progress`,
 *        `completed`, `failed` alongside the original five
 *        (`active` / `submitted` / `approved` / `rejected` / `cancelled`).
 *        The honor-system flow uses the new three; the original five
 *        stay on the books for the future resolver workflow.
 *      - Index on (`game_team_id`, `game_node_challenge_id`) for the
 *        projection's "most recent attempt" lookup.
 *
 *   5. `game_team_positions`:
 *      - `pending_swap_credit BOOLEAN NOT NULL DEFAULT FALSE`:
 *        true between CHALLENGE_COMPLETED and SWAP_TILE; resets on
 *        CHECK_IN / CHECK_OUT.
 *      - `credit_earned_in_session BOOLEAN NOT NULL DEFAULT FALSE`:
 *        sticky once a credit is earned within a check-in session, so
 *        a second completion in the same session is rejected. Resets
 *        on CHECK_IN / CHECK_OUT.
 *
 * Backfill is trivial: there are no pre-existing rows in any challenge
 * table, and the boolean defaults on `game_team_positions` keep older
 * games legacy-compatible (the engine bypasses the credit gate when a
 * node has zero `game_node_challenges` rows).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. map_template_node_challenges
      await queryInterface.createTable(
        'map_template_node_challenges',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          map_template_node_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'map_template_nodes', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          challenge_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'challenges', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          sort_order: {
            type: Sequelize.INTEGER,
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
        },
        { transaction },
      );
      await queryInterface.addIndex(
        'map_template_node_challenges',
        ['map_template_node_id'],
        { transaction },
      );
      await queryInterface.addIndex(
        'map_template_node_challenges',
        ['map_template_node_id', 'sort_order'],
        {
          unique: true,
          name: 'map_template_node_challenges_node_sort_unique',
          transaction,
        },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE map_template_node_challenges
        ADD CONSTRAINT map_template_node_challenges_sort_order_nonneg_check
        CHECK (sort_order >= 0);
        `,
        { transaction },
      );

      // 2. game_node_challenges
      await queryInterface.createTable(
        'game_node_challenges',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          game_node_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'game_nodes', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          challenge_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'challenges', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          sort_order: {
            type: Sequelize.INTEGER,
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
        },
        { transaction },
      );
      await queryInterface.addIndex(
        'game_node_challenges',
        ['game_node_id'],
        { transaction },
      );
      await queryInterface.addIndex(
        'game_node_challenges',
        ['game_node_id', 'sort_order'],
        {
          unique: true,
          name: 'game_node_challenges_node_sort_unique',
          transaction,
        },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_node_challenges
        ADD CONSTRAINT game_node_challenges_sort_order_nonneg_check
        CHECK (sort_order >= 0);
        `,
        { transaction },
      );

      // 3. challenges.flavor_text
      await queryInterface.addColumn(
        'challenges',
        'flavor_text',
        {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        { transaction },
      );

      // 4. game_challenge_instances
      await queryInterface.addColumn(
        'game_challenge_instances',
        'game_node_challenge_id',
        {
          type: Sequelize.UUID,
          allowNull: true, // temporarily — see ALTER below
          references: { model: 'game_node_challenges', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );
      // No rows exist yet, so promote to NOT NULL in the same migration.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_challenge_instances
        ALTER COLUMN game_node_challenge_id SET NOT NULL;
        `,
        { transaction },
      );
      await queryInterface.addColumn(
        'game_challenge_instances',
        'cooldown_until',
        {
          type: Sequelize.DATE,
          allowNull: true,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_challenge_instances
        DROP CONSTRAINT IF EXISTS game_challenge_instances_status_check;
        `,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_challenge_instances
        ADD CONSTRAINT game_challenge_instances_status_check
        CHECK (status IN (
          'in_progress',
          'completed',
          'failed',
          'active',
          'submitted',
          'approved',
          'rejected',
          'cancelled'
        ));
        `,
        { transaction },
      );
      await queryInterface.addIndex(
        'game_challenge_instances',
        ['game_team_id', 'game_node_challenge_id'],
        {
          name: 'game_challenge_instances_team_node_challenge_idx',
          transaction,
        },
      );

      // 5. game_team_positions
      await queryInterface.addColumn(
        'game_team_positions',
        'pending_swap_credit',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'game_team_positions',
        'credit_earned_in_session',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 5. game_team_positions
      await queryInterface.removeColumn(
        'game_team_positions',
        'credit_earned_in_session',
        { transaction },
      );
      await queryInterface.removeColumn(
        'game_team_positions',
        'pending_swap_credit',
        { transaction },
      );

      // 4. game_challenge_instances
      await queryInterface.removeIndex(
        'game_challenge_instances',
        'game_challenge_instances_team_node_challenge_idx',
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_challenge_instances
        DROP CONSTRAINT IF EXISTS game_challenge_instances_status_check;
        `,
        { transaction },
      );
      // Restore the original five-value CHECK from 20260517199000.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_challenge_instances
        ADD CONSTRAINT game_challenge_instances_status_check
        CHECK (status IN ('active', 'submitted', 'approved', 'rejected', 'cancelled'));
        `,
        { transaction },
      );
      await queryInterface.removeColumn(
        'game_challenge_instances',
        'cooldown_until',
        { transaction },
      );
      await queryInterface.removeColumn(
        'game_challenge_instances',
        'game_node_challenge_id',
        { transaction },
      );

      // 3. challenges.flavor_text
      await queryInterface.removeColumn('challenges', 'flavor_text', { transaction });

      // 2. game_node_challenges
      await queryInterface.sequelize.query(
        `ALTER TABLE game_node_challenges DROP CONSTRAINT IF EXISTS game_node_challenges_sort_order_nonneg_check;`,
        { transaction },
      );
      await queryInterface.dropTable('game_node_challenges', { transaction });

      // 1. map_template_node_challenges
      await queryInterface.sequelize.query(
        `ALTER TABLE map_template_node_challenges DROP CONSTRAINT IF EXISTS map_template_node_challenges_sort_order_nonneg_check;`,
        { transaction },
      );
      await queryInterface.dropTable('map_template_node_challenges', { transaction });
    });
  },
};
