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
    if ((await tableRowCount(queryInterface, 'team_definitions')) > 0) {
      return;
    }

    const now = new Date();
    await queryInterface.bulkInsert('team_definitions', [
      {
        id: randomUUID(),
        code: 'east',
        display_name: 'East',
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        code: 'south',
        display_name: 'South',
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        code: 'west',
        display_name: 'West',
        sort_order: 2,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        code: 'north',
        display_name: 'North',
        sort_order: 3,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('team_definitions', null, {});
  },
};
