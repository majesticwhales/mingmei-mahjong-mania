'use strict';

const { randomUUID } = require('crypto');
const network = require('./data/ttc2026-network.cjs');

const TEMPLATE_NAME = network.template.name;

async function findTemplateId(queryInterface) {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT id FROM map_templates WHERE name = :name LIMIT 1',
    { replacements: { name: TEMPLATE_NAME } },
  );
  return rows[0]?.id ?? null;
}

function edgeKey(fromCode, toCode) {
  return fromCode < toCode ? `${fromCode}|${toCode}` : `${toCode}|${fromCode}`;
}

/** bulkInsert does not auto-serialize JSONB; stringify for PostgreSQL. */
function renderMetadataJson(line) {
  return JSON.stringify({
    stationIds: line.stationIds,
    bends: line.bends ?? null,
  });
}

function deriveAutoDistributedOffsets(slotsPerNode, gameDurationSeconds) {
  const out = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    out.push(Math.round((gameDurationSeconds * k) / slotsPerNode));
  }
  return out;
}

function buildUndirectedEdges(lines, stationCodes) {
  const edges = new Map();
  for (const line of lines) {
    const ids = line.stationIds.filter((id) => stationCodes.has(id));
    for (let i = 0; i < ids.length - 1; i += 1) {
      const from = ids[i];
      const to = ids[i + 1];
      edges.set(edgeKey(from, to), { from, to });
    }
  }
  return [...edges.values()];
}

async function updateExistingTemplate(queryInterface, templateId) {
  const now = new Date();
  const { template, stations, lines } = network;
  const slotUnlockOffsetsSeconds = deriveAutoDistributedOffsets(
    3,
    template.defaultDurationSeconds,
  );

  await queryInterface.bulkUpdate(
    'map_templates',
    {
      description: template.description,
      default_duration_seconds: template.defaultDurationSeconds,
      default_hand_size: template.defaultHandSize,
      node_count: template.nodeCount,
      default_visibility_phase_count: 3,
      default_slots_per_node: 3,
      default_dead_wall_size: 15,
      default_visibility_mode: 'slot',
      default_slot_unlock_offsets_seconds: slotUnlockOffsetsSeconds,
      // Phase L (§3.13): map-reveal timer staggered later than claim
      // reveal, expressing tier-2 (slot 1 claim now / map at 60min) and
      // tier-3 (slot 2 claim at 40min / map at 120min) defaults.
      default_slot_map_unlock_offsets_seconds: [0, 3600, 7200],
      default_start_node_code: 'bay',
      updated_at: now,
    },
    { id: templateId },
  );

  for (const [index, line] of lines.entries()) {
    await queryInterface.bulkUpdate(
      'map_template_lines',
      {
        name: line.name,
        short_name: line.shortName,
        color: line.color,
        sort_order: index,
        render_metadata: renderMetadataJson(line),
        updated_at: now,
      },
      { map_template_id: templateId, code: line.code },
    );
  }

  for (const station of stations) {
    await queryInterface.bulkUpdate(
      'map_template_nodes',
      {
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        coordinate_x: station.x,
        coordinate_y: station.y,
        label_anchor: station.labelAnchor,
        label_rotate: station.labelRotate,
        is_interchange: station.isInterchange,
        updated_at: now,
      },
      { map_template_id: templateId, code: station.code },
    );
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const existingTemplateId = await findTemplateId(queryInterface);
    if (existingTemplateId) {
      await updateExistingTemplate(queryInterface, existingTemplateId);
      return;
    }

    const now = new Date();
    const templateId = randomUUID();
    const { template, stations, lines } = network;
    const slotUnlockOffsetsSeconds = deriveAutoDistributedOffsets(
      3,
      template.defaultDurationSeconds,
    );

    await queryInterface.bulkInsert('map_templates', [
      {
        id: templateId,
        name: template.name,
        description: template.description,
        default_duration_seconds: template.defaultDurationSeconds,
        default_hand_size: template.defaultHandSize,
        node_count: template.nodeCount,
        default_visibility_phase_count: 3,
        default_slots_per_node: 3,
        default_dead_wall_size: 15,
        default_visibility_mode: 'slot',
        default_slot_unlock_offsets_seconds: slotUnlockOffsetsSeconds,
        // Phase L (§3.13): map-reveal timer staggered later than claim
        // reveal. See `updateExistingTemplate` for rationale.
        default_slot_map_unlock_offsets_seconds: [0, 3600, 7200],
        default_start_node_code: 'bay',
        created_at: now,
        updated_at: now,
      },
    ]);

    const lineIdByCode = new Map();
    const lineRows = lines.map((line, index) => {
      const id = randomUUID();
      lineIdByCode.set(line.code, id);
      return {
        id,
        map_template_id: templateId,
        code: line.code,
        name: line.name,
        short_name: line.shortName,
        color: line.color,
        sort_order: index,
        render_metadata: renderMetadataJson(line),
        created_at: now,
        updated_at: now,
      };
    });
    await queryInterface.bulkInsert('map_template_lines', lineRows);

    const nodeIdByCode = new Map();
    const nodeRows = stations.map((station) => {
      if (
        typeof station.latitude !== 'number' ||
        typeof station.longitude !== 'number'
      ) {
        throw new Error(
          `Station "${station.code}" is missing latitude/longitude in ttc2026-network.cjs`,
        );
      }
      const id = randomUUID();
      nodeIdByCode.set(station.code, id);
      return {
        id,
        map_template_id: templateId,
        code: station.code,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
        geofence_radius_meters: 100,
        coordinate_x: station.x,
        coordinate_y: station.y,
        label_anchor: station.labelAnchor,
        label_rotate: station.labelRotate,
        is_interchange: station.isInterchange,
        created_at: now,
        updated_at: now,
      };
    });
    await queryInterface.bulkInsert('map_template_nodes', nodeRows);

    const nodeLineRows = [];
    for (const station of stations) {
      const nodeId = nodeIdByCode.get(station.code);
      for (const lineCode of station.lineIds) {
        const lineId = lineIdByCode.get(lineCode);
        if (!lineId) {
          throw new Error(
            `Station "${station.code}" references unknown line "${lineCode}"`,
          );
        }
        nodeLineRows.push({
          id: randomUUID(),
          map_template_node_id: nodeId,
          map_template_line_id: lineId,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('map_template_node_lines', nodeLineRows);

    const edgePairs = buildUndirectedEdges(lines, nodeIdByCode);
    const edgeRows = edgePairs.map(({ from, to }) => ({
      id: randomUUID(),
      map_template_id: templateId,
      from_node_id: nodeIdByCode.get(from),
      to_node_id: nodeIdByCode.get(to),
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('map_template_edges', edgeRows);
  },

  async down(queryInterface) {
    const templateId = await findTemplateId(queryInterface);
    if (!templateId) {
      return;
    }

    await queryInterface.bulkDelete('map_templates', { id: templateId });
  },
};
