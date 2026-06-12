'use strict';

/**
 * Add `challenges.image_url` — optional free-text URL surfaced on
 * `AtStationChallengeDto.imageUrl` and rendered inside `ChallengeModal`.
 *
 * Free-text TEXT NULL: callers may store an absolute path served by the
 * client static bundle (e.g. `/challenges/bay.png` from
 * `client/public/challenges/`), an external CDN URL, or `null` when the
 * challenge has no illustration. No validation, no FK to `media_assets`
 * — the value flows through verbatim.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('challenges', 'image_url', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('challenges', 'image_url');
  },
};
