'use strict';

const { randomUUID } = require('crypto');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
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
