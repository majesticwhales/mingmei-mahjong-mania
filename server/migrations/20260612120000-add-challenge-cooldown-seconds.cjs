'use strict';

/**
 * Per-game challenge cooldown (TDD §3.8).
 *
 * Until this migration the cooldown applied after a challenge resolves
 * (completion or forfeit) was a hard-coded `CHALLENGE_COOLDOWN_MS = 5min`
 * constant in `engine/challenge-lifecycle.ts`. The constant served prod
 * fine but made the test preset (`TEST_LOBBY_PRESET`, 240s games) tedious
 * to exercise — a 5min floor swallows nearly the whole game.
 *
 * Schema changes (single transaction):
 *   1. `lobbies.challenge_cooldown_seconds INTEGER NOT NULL DEFAULT 300`:
 *      Host-editable knob, sourced from the chosen
 *      `LobbyGamePreset.challengeCooldownSeconds` on lobby creation,
 *      snapshotted to `games.challenge_cooldown_seconds` at game start.
 *   2. `games.challenge_cooldown_seconds INTEGER NOT NULL DEFAULT 300`:
 *      Snapshot of the lobby value. The engine reads from this column
 *      (via `ctx.game`) when stamping `cooldown_until` on resolved
 *      challenge instances; mid-game edits on the lobby would not
 *      retroactively change the game.
 *   3. CHECK `>= 0` on each new column. Upper bound intentionally
 *      unbounded — a host can pick anything from 0 (no cooldown) up to
 *      the game duration if they want a long cool-down floor.
 *
 * Default `300` (= the legacy 5-minute constant) keeps pre-migration
 * lobbies + games behaving identically; the test preset will overwrite
 * to `5` at create / start time.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'lobbies',
        'challenge_cooldown_seconds',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 300,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE lobbies
        ADD CONSTRAINT lobbies_challenge_cooldown_seconds_nonneg_check
        CHECK (challenge_cooldown_seconds >= 0);
        `,
        { transaction },
      );

      await queryInterface.addColumn(
        'games',
        'challenge_cooldown_seconds',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 300,
        },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `
        ALTER TABLE games
        ADD CONSTRAINT games_challenge_cooldown_seconds_nonneg_check
        CHECK (challenge_cooldown_seconds >= 0);
        `,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE games DROP CONSTRAINT IF EXISTS games_challenge_cooldown_seconds_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'games',
        'challenge_cooldown_seconds',
        { transaction },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE lobbies DROP CONSTRAINT IF EXISTS lobbies_challenge_cooldown_seconds_nonneg_check;`,
        { transaction },
      );
      await queryInterface.removeColumn(
        'lobbies',
        'challenge_cooldown_seconds',
        { transaction },
      );
    });
  },
};
