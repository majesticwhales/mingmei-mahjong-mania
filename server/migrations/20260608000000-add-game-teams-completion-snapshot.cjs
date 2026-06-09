'use strict';

/**
 * Phase J — `game_teams` hand-completion snapshot (chunk 1 of 6).
 *
 * Adds the per-team end-of-game snapshot columns described in TDD §3.10
 * and §4.2. Behaviour-neutral on its own: the producer (CLAIM_WIN handler
 * + reworked GAME_END scheduler handler) lands in chunks 2-3, and the
 * consumers (projection + summary endpoint) in chunks 4-5.
 *
 * Schema changes (single transaction):
 *
 *   1. `game_teams.hand_completed_at TIMESTAMPTZ NULL`:
 *      - The lock pivot. NULL until the team runs `CLAIM_WIN` (or the
 *        `GAME_END` timer path stamps an incomplete-team snapshot with
 *        `final_*` = 0 and leaves this NULL — see chunk 3).
 *
 *   2. `game_teams.winning_tile_id UUID NULL`:
 *      - FK → `game_tiles(id)` ON DELETE RESTRICT. The station tile the
 *        team claimed as their 14th tile. NULL until `CLAIM_WIN`.
 *
 *   3. `game_teams.winning_node_id UUID NULL`:
 *      - FK → `game_nodes(id)` ON DELETE RESTRICT. Cached so the summary
 *        endpoint doesn't have to walk placements. NULL until `CLAIM_WIN`.
 *
 *   4. `game_teams.final_han INTEGER NULL` + CHECK `>= 0`:
 *      - Total han incl. red-five + dora bonuses (or 13 × yakumanCount on
 *        the yakuman path).
 *
 *   5. `game_teams.final_fu INTEGER NULL` + CHECK `>= 0`.
 *
 *   6. `game_teams.final_points INTEGER NULL` + CHECK `>= 0`:
 *      - Non-dealer tsumo total. 0 for noten / incomplete teams stamped
 *        by the timer path.
 *
 *   7. `game_teams.final_yaku_keys JSONB NULL`:
 *      - Compact `{ name: string; han: number }[]` snapshot from
 *        `analyzeHand.waits[i].yaku` for the winning team. NULL for
 *        incomplete teams; the summary endpoint runs `analyzeHand` over
 *        the 13-tile hand at request time to surface the wait set.
 *
 *   8. Multi-column CHECK `game_teams_completion_snapshot_consistent`:
 *      - `(hand_completed_at IS NULL) OR (winning_tile_id IS NOT NULL
 *         AND winning_node_id IS NOT NULL AND final_han IS NOT NULL
 *         AND final_fu IS NOT NULL AND final_points IS NOT NULL)`.
 *      - Once a team is marked complete, all five required snapshot
 *        columns must be present. `final_yaku_keys` stays optional —
 *        the column is loosely typed and absent for yakuman-only or
 *        truly noten rows.
 *
 *   9. Index `idx_game_teams_game_hand_completed` on
 *      `(game_id, hand_completed_at)` for the all-teams-completed
 *      termination check in chunk 3 (`COUNT(*) WHERE game_id = ? AND
 *      hand_completed_at IS NULL`).
 *
 * Pre-existing rows backfill safely: every existing `game_teams` row
 * gets all new columns set to NULL, which trivially satisfies the
 * multi-column CHECK.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'game_teams',
        'hand_completed_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'winning_tile_id',
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'game_tiles', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'winning_node_id',
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'game_nodes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'final_han',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_teams
        ADD CONSTRAINT game_teams_final_han_nonneg_check
        CHECK (final_han IS NULL OR final_han >= 0);
        `,
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'final_fu',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_teams
        ADD CONSTRAINT game_teams_final_fu_nonneg_check
        CHECK (final_fu IS NULL OR final_fu >= 0);
        `,
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'final_points',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_teams
        ADD CONSTRAINT game_teams_final_points_nonneg_check
        CHECK (final_points IS NULL OR final_points >= 0);
        `,
        { transaction },
      );

      await queryInterface.addColumn(
        'game_teams',
        'final_yaku_keys',
        { type: Sequelize.JSONB, allowNull: true },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `
        ALTER TABLE game_teams
        ADD CONSTRAINT game_teams_completion_snapshot_consistent CHECK (
          hand_completed_at IS NULL
          OR (
            winning_tile_id IS NOT NULL
            AND winning_node_id IS NOT NULL
            AND final_han IS NOT NULL
            AND final_fu IS NOT NULL
            AND final_points IS NOT NULL
          )
        );
        `,
        { transaction },
      );

      await queryInterface.addIndex('game_teams', {
        name: 'idx_game_teams_game_hand_completed',
        fields: ['game_id', 'hand_completed_at'],
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        'game_teams',
        'idx_game_teams_game_hand_completed',
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE game_teams DROP CONSTRAINT IF EXISTS game_teams_completion_snapshot_consistent;`,
        { transaction },
      );

      await queryInterface.removeColumn('game_teams', 'final_yaku_keys', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE game_teams DROP CONSTRAINT IF EXISTS game_teams_final_points_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('game_teams', 'final_points', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE game_teams DROP CONSTRAINT IF EXISTS game_teams_final_fu_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('game_teams', 'final_fu', { transaction });

      await queryInterface.sequelize.query(
        `ALTER TABLE game_teams DROP CONSTRAINT IF EXISTS game_teams_final_han_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn('game_teams', 'final_han', { transaction });

      await queryInterface.removeColumn('game_teams', 'winning_node_id', { transaction });
      await queryInterface.removeColumn('game_teams', 'winning_tile_id', { transaction });
      await queryInterface.removeColumn('game_teams', 'hand_completed_at', { transaction });
    });
  },
};
