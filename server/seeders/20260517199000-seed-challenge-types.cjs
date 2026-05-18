'use strict';

const { randomUUID } = require('crypto');

async function tableRowCount(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*)::int AS count FROM ${tableName}`,
  );
  return Number(rows[0].count);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if ((await tableRowCount(queryInterface, 'challenge_types')) > 0) {
      return;
    }

    const now = new Date();
    await queryInterface.bulkInsert('challenge_types', [
      {
        id: randomUUID(),
        code: 'travel',
        name: 'Travel',
        resolver_key: 'travel',
        description: 'Movement or direction-based challenges',
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        code: 'photo',
        name: 'Photo',
        resolver_key: 'photo',
        description: 'Photo submission challenges',
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        code: 'task',
        name: 'Repeated Task',
        resolver_key: 'task',
        description: 'Repeated task challenges',
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('challenge_types', {
      code: ['travel', 'photo', 'task'],
    });
  },
};
