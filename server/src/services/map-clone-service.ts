import type { Transaction } from "sequelize";
import { EXPECTED_MAP_NODE_COUNT } from "../game/visibility-groups.ts";
import { HttpError } from "../lib/http-error.ts";
import { GameEdge } from "../models/game-edge.ts";
import { GameLine } from "../models/game-line.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeLine } from "../models/game-node-line.ts";
import { MapTemplate } from "../models/map-template.ts";
import { MapTemplateEdge } from "../models/map-template-edge.ts";
import { MapTemplateLine } from "../models/map-template-line.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";
import { MapTemplateNodeLine } from "../models/map-template-node-line.ts";

const DEFAULT_GEOFENCE_RADIUS_METERS = 100;

export interface ClonedGameMap {
  gameNodeIds: string[];
  gameNodeIdByTemplateNodeId: Map<string, string>;
  gameLineIdByTemplateLineId: Map<string, string>;
}

export async function cloneMapTemplateToGame(
  gameId: string,
  mapTemplateId: string,
  transaction: Transaction,
): Promise<ClonedGameMap> {
  const template = await MapTemplate.findByPk(mapTemplateId, {
    include: [
      {
        model: MapTemplateNode,
        include: [{ model: MapTemplateNodeLine }],
      },
      {
        model: MapTemplateLine,
        separate: true,
        order: [["sortOrder", "ASC"]],
      },
      { model: MapTemplateEdge },
    ],
    transaction,
  });

  if (!template) {
    throw new HttpError(404, "not_found", "Map template not found");
  }

  const templateNodes = template.nodes ?? [];
  const templateLines = template.lines ?? [];
  const templateEdges = template.edges ?? [];

  if (template.nodeCount !== EXPECTED_MAP_NODE_COUNT) {
    throw new HttpError(
      500,
      "internal_error",
      `Map template must have ${EXPECTED_MAP_NODE_COUNT} nodes (has nodeCount ${template.nodeCount})`,
    );
  }
  if (templateNodes.length !== EXPECTED_MAP_NODE_COUNT) {
    throw new HttpError(
      500,
      "internal_error",
      `Map template must have ${EXPECTED_MAP_NODE_COUNT} node rows (has ${templateNodes.length})`,
    );
  }

  const gameLines = await GameLine.bulkCreate(
    templateLines.map((line) => ({
      gameId,
      templateLineId: line.id,
      code: line.code,
      name: line.name,
      shortName: line.shortName,
      color: line.color,
      sortOrder: line.sortOrder,
      renderMetadata: line.renderMetadata,
    })),
    { transaction, returning: true },
  );

  const gameLineIdByTemplateLineId = new Map<string, string>();
  for (const line of gameLines) {
    gameLineIdByTemplateLineId.set(line.templateLineId, line.id);
  }

  const gameNodes = await GameNode.bulkCreate(
    templateNodes.map((node) => ({
      gameId,
      templateNodeId: node.id,
      code: node.code,
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      geofenceRadiusMeters:
        node.geofenceRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
      coordinateX: node.coordinateX,
      coordinateY: node.coordinateY,
      labelAnchor: node.labelAnchor,
      labelRotate: node.labelRotate,
      isInterchange: node.isInterchange,
    })),
    { transaction, returning: true },
  );

  const gameNodeIdByTemplateNodeId = new Map<string, string>();
  const gameNodeIds: string[] = [];
  for (const node of gameNodes) {
    gameNodeIdByTemplateNodeId.set(node.templateNodeId, node.id);
    gameNodeIds.push(node.id);
  }

  const nodeLineRows: Array<{
    gameNodeId: string;
    gameLineId: string;
  }> = [];
  for (const node of templateNodes) {
    const gameNodeId = gameNodeIdByTemplateNodeId.get(node.id);
    if (!gameNodeId) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing cloned game node for template node ${node.id}`,
      );
    }
    for (const nodeLine of node.nodeLines ?? []) {
      const gameLineId = gameLineIdByTemplateLineId.get(
        nodeLine.mapTemplateLineId,
      );
      if (!gameLineId) {
        throw new HttpError(
          500,
          "internal_error",
          `Missing cloned game line for template line ${nodeLine.mapTemplateLineId}`,
        );
      }
      nodeLineRows.push({ gameNodeId, gameLineId });
    }
  }
  if (nodeLineRows.length > 0) {
    await GameNodeLine.bulkCreate(nodeLineRows, { transaction });
  }

  if (templateEdges.length > 0) {
    await GameEdge.bulkCreate(
      templateEdges.map((edge) => {
        const fromGameNodeId = gameNodeIdByTemplateNodeId.get(edge.fromNodeId);
        const toGameNodeId = gameNodeIdByTemplateNodeId.get(edge.toNodeId);
        if (!fromGameNodeId || !toGameNodeId) {
          throw new HttpError(
            500,
            "internal_error",
            `Missing cloned game node for template edge ${edge.id}`,
          );
        }
        return {
          gameId,
          fromGameNodeId,
          toGameNodeId,
          weight: null,
          travelSeconds: null,
        };
      }),
      { transaction },
    );
  }

  return {
    gameNodeIds,
    gameNodeIdByTemplateNodeId,
    gameLineIdByTemplateLineId,
  };
}
