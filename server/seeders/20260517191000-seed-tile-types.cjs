'use strict';

const { randomUUID } = require('crypto');

async function tableRowCount(queryInterface, tableName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*)::int AS count FROM ${tableName}`,
  );
  return Number(rows[0].count);
}

const SUIT_SORT = {
  man: 0,
  pin: 1,
  sou: 2,
  wind: 3,
  dragon: 4,
};

const WIND_NAMES = {
  1: 'East',
  2: 'South',
  3: 'West',
  4: 'North',
};

const DRAGON_NAMES = {
  1: 'Red',
  2: 'White',
  3: 'Green',
};

const SUIT_LABELS = {
  man: 'Man',
  pin: 'Pin',
  sou: 'Sou',
};

function buildTileRows(now) {
  const rows = [];

  const addCopies = (suit, rank, suitSortOrder, displayName) => {
    for (let copyIndex = 0; copyIndex < 4; copyIndex += 1) {
      rows.push({
        id: randomUUID(),
        suit,
        rank,
        copy_index: copyIndex,
        suit_sort_order: suitSortOrder,
        display_name: displayName,
        created_at: now,
        updated_at: now,
      });
    }
  };

  for (let rank = 1; rank <= 4; rank += 1) {
    addCopies('wind', rank, SUIT_SORT.wind, `${WIND_NAMES[rank]} Wind`);
  }

  for (let rank = 1; rank <= 3; rank += 1) {
    addCopies('dragon', rank, SUIT_SORT.dragon, `${DRAGON_NAMES[rank]} Dragon`);
  }

  for (const suit of ['man', 'pin', 'sou']) {
    for (let rank = 1; rank <= 9; rank += 1) {
      addCopies(suit, rank, SUIT_SORT[suit], `${rank} ${SUIT_LABELS[suit]}`);
    }
  }

  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const existing = await tableRowCount(queryInterface, 'tile_types');
    if (existing === 136) {
      return;
    }
    if (existing > 0) {
      throw new Error(
        `tile_types has ${existing} rows (expected 0 or 136). ` +
          'Run npm run db:seed:undo --prefix server or DELETE FROM tile_types before re-seeding.',
      );
    }

    const now = new Date();
    const rows = buildTileRows(now);

    if (rows.length !== 136) {
      throw new Error(`Expected 136 tile_types, got ${rows.length}`);
    }

    await queryInterface.bulkInsert('tile_types', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('tile_types', null, {});
  },
};
