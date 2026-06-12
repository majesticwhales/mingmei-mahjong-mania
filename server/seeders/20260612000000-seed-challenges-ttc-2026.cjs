'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

const DEFAULT_JSON_PATH = path.join(
  __dirname,
  'data',
  'challenges',
  'ttc-2026.json',
);

/**
 * Read the authoring JSON. The `_doc` / `$schema` fields are inert
 * documentation — ignored by the seeder. Throws on JSON parse errors so
 * a malformed file fails the seed run loudly instead of silently
 * upserting half a deck.
 */
function loadContent(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.deck || !parsed.deck.code) {
    throw new Error(`${jsonPath}: missing required "deck.code" field`);
  }
  if (!parsed.templateName) {
    throw new Error(`${jsonPath}: missing required "templateName" field`);
  }
  if (!parsed.stations || typeof parsed.stations !== 'object') {
    throw new Error(`${jsonPath}: "stations" must be an object`);
  }
  return parsed;
}

async function selectOne(queryInterface, sql, replacements, transaction) {
  const [rows] = await queryInterface.sequelize.query(sql, {
    replacements,
    transaction,
  });
  return rows[0] ?? null;
}

async function resolveTemplateId(queryInterface, templateName, transaction) {
  const row = await selectOne(
    queryInterface,
    'SELECT id FROM map_templates WHERE name = :name LIMIT 1',
    { name: templateName },
    transaction,
  );
  return row?.id ?? null;
}

async function resolveChallengeTypeIdByCode(queryInterface, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT id, code FROM challenge_types',
    { transaction },
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.code, row.id);
  }
  return map;
}

async function resolveTemplateNodeIdByCode(
  queryInterface,
  templateId,
  transaction,
) {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT id, code FROM map_template_nodes WHERE map_template_id = :templateId',
    { replacements: { templateId }, transaction },
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.code, row.id);
  }
  return map;
}

/**
 * Upsert the deck row by `code`. Returns the deck id. Updates name +
 * description in place when the row already exists so JSON edits to
 * those fields propagate on re-run.
 */
async function upsertDeck(queryInterface, deck, now, transaction) {
  const existing = await selectOne(
    queryInterface,
    'SELECT id FROM challenge_decks WHERE code = :code LIMIT 1',
    { code: deck.code },
    transaction,
  );
  if (existing) {
    await queryInterface.bulkUpdate(
      'challenge_decks',
      {
        name: deck.name,
        description: deck.description ?? null,
        updated_at: now,
      },
      { id: existing.id },
      { transaction },
    );
    return existing.id;
  }
  const id = randomUUID();
  await queryInterface.bulkInsert(
    'challenge_decks',
    [
      {
        id,
        code: deck.code,
        name: deck.name,
        description: deck.description ?? null,
        is_active: true,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      },
    ],
    { transaction },
  );
  return id;
}

/**
 * Upsert a `challenges` row keyed by (deck_id, code). Returns the
 * challenge id. Updates title / description / flavor_text / image_url /
 * challenge_type_id in place so JSON edits to authoring fields land on
 * the next seed run.
 */
async function upsertChallenge(
  queryInterface,
  args,
  now,
  transaction,
) {
  const { deckId, entry, typeId } = args;
  const existing = await selectOne(
    queryInterface,
    'SELECT id FROM challenges WHERE challenge_deck_id = :deckId AND code = :code LIMIT 1',
    { deckId, code: entry.code },
    transaction,
  );
  if (existing) {
    await queryInterface.bulkUpdate(
      'challenges',
      {
        challenge_type_id: typeId,
        title: entry.title,
        description: entry.description ?? null,
        flavor_text: entry.flavorText ?? null,
        image_url: entry.imageUrl ?? null,
        is_active: true,
        updated_at: now,
      },
      { id: existing.id },
      { transaction },
    );
    return existing.id;
  }
  const id = randomUUID();
  await queryInterface.bulkInsert(
    'challenges',
    [
      {
        id,
        challenge_deck_id: deckId,
        challenge_type_id: typeId,
        code: entry.code,
        title: entry.title,
        description: entry.description ?? null,
        flavor_text: entry.flavorText ?? null,
        image_url: entry.imageUrl ?? null,
        parameters: JSON.stringify({}),
        sort_order: 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
    { transaction },
  );
  return id;
}

/**
 * Upsert a `map_template_node_challenges` binding keyed by
 * (map_template_node_id, sort_order). When the slot already exists with
 * a different `challenge_id`, repoints it at the new challenge so
 * re-ordering entries in the JSON propagates cleanly.
 */
async function upsertBinding(queryInterface, args, now, transaction) {
  const { templateNodeId, challengeId, sortOrder } = args;
  const existing = await selectOne(
    queryInterface,
    `SELECT id, challenge_id FROM map_template_node_challenges
     WHERE map_template_node_id = :templateNodeId AND sort_order = :sortOrder
     LIMIT 1`,
    { templateNodeId, sortOrder },
    transaction,
  );
  if (existing) {
    if (existing.challenge_id === challengeId) {
      return existing.id;
    }
    await queryInterface.bulkUpdate(
      'map_template_node_challenges',
      { challenge_id: challengeId, updated_at: now },
      { id: existing.id },
      { transaction },
    );
    return existing.id;
  }
  const id = randomUUID();
  await queryInterface.bulkInsert(
    'map_template_node_challenges',
    [
      {
        id,
        map_template_node_id: templateNodeId,
        challenge_id: challengeId,
        sort_order: sortOrder,
        created_at: now,
        updated_at: now,
      },
    ],
    { transaction },
  );
  return id;
}

/**
 * Main entry. Idempotent: re-running against an unchanged JSON file is a
 * no-op (apart from `updated_at` bumps).
 *
 * Returns a summary suitable for asserting in tests.
 */
async function seedChallengesFromJson(queryInterface, jsonPath = DEFAULT_JSON_PATH) {
  const content = loadContent(jsonPath);
  const now = new Date();
  let summary = {
    deckId: null,
    challengeCount: 0,
    bindingCount: 0,
    skippedNodes: [],
  };

  await queryInterface.sequelize.transaction(async (transaction) => {
    const templateId = await resolveTemplateId(
      queryInterface,
      content.templateName,
      transaction,
    );
    if (!templateId) {
      throw new Error(
        `seedChallengesFromJson: map_templates.name='${content.templateName}' not found. ` +
          'Run the map-template seeder first.',
      );
    }

    const typeIdByCode = await resolveChallengeTypeIdByCode(
      queryInterface,
      transaction,
    );
    if (typeIdByCode.size === 0) {
      throw new Error(
        'seedChallengesFromJson: challenge_types is empty. ' +
          'Run the challenge-types seeder first.',
      );
    }

    const nodeIdByCode = await resolveTemplateNodeIdByCode(
      queryInterface,
      templateId,
      transaction,
    );

    const deckId = await upsertDeck(queryInterface, content.deck, now, transaction);
    summary.deckId = deckId;

    for (const [nodeCode, entries] of Object.entries(content.stations)) {
      const templateNodeId = nodeIdByCode.get(nodeCode);
      if (!templateNodeId) {
        console.warn(
          `seedChallengesFromJson: skipping unknown nodeCode '${nodeCode}'` +
            ` (no map_template_nodes row for template='${content.templateName}')`,
        );
        summary.skippedNodes.push(nodeCode);
        continue;
      }
      if (!Array.isArray(entries)) {
        throw new Error(
          `seedChallengesFromJson: stations['${nodeCode}'] must be an array`,
        );
      }
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (!entry || !entry.code || !entry.title) {
          throw new Error(
            `seedChallengesFromJson: stations['${nodeCode}'][${i}] missing required 'code' or 'title'`,
          );
        }
        const typeCode = entry.type ?? 'task';
        const typeId = typeIdByCode.get(typeCode);
        if (!typeId) {
          throw new Error(
            `seedChallengesFromJson: stations['${nodeCode}'][${i}] references unknown challenge_types.code='${typeCode}'`,
          );
        }
        const challengeId = await upsertChallenge(
          queryInterface,
          { deckId, entry, typeId },
          now,
          transaction,
        );
        summary.challengeCount += 1;
        await upsertBinding(
          queryInterface,
          { templateNodeId, challengeId, sortOrder: i },
          now,
          transaction,
        );
        summary.bindingCount += 1;
      }
    }
  });

  return summary;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  seedChallengesFromJson,
  DEFAULT_JSON_PATH,

  async up(queryInterface) {
    await seedChallengesFromJson(queryInterface);
  },

  /**
   * Tears down only what this seeder wrote, keyed off `deck.code` from
   * the JSON. Deletion order: bindings (FK RESTRICT on challenges) →
   * deck delete (cascades to challenges).
   */
  async down(queryInterface) {
    const content = loadContent(DEFAULT_JSON_PATH);
    await queryInterface.sequelize.transaction(async (transaction) => {
      const deck = await selectOne(
        queryInterface,
        'SELECT id FROM challenge_decks WHERE code = :code LIMIT 1',
        { code: content.deck.code },
        transaction,
      );
      if (!deck) {
        return;
      }
      await queryInterface.sequelize.query(
        `DELETE FROM map_template_node_challenges
           WHERE challenge_id IN (
             SELECT id FROM challenges WHERE challenge_deck_id = :deckId
           )`,
        { replacements: { deckId: deck.id }, transaction },
      );
      await queryInterface.bulkDelete(
        'challenge_decks',
        { id: deck.id },
        { transaction },
      );
    });
  },
};
