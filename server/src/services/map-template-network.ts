import { MapTemplate } from "../models/map-template.ts";
import { MapTemplateLine } from "../models/map-template-line.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";

const DEFAULT_TEMPLATE_NAME = "TTC 2026";

export interface MapTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
}

export interface NetworkStationDto {
  id: string;
  name: string;
  x: number;
  y: number;
  lineIds: string[];
  isInterchange: boolean;
  labelAnchor?: string;
  labelRotate?: number;
  latitude: number;
  longitude: number;
}

export interface NetworkLineDto {
  id: string;
  name: string;
  shortName: string;
  color: string;
  stationIds: string[];
  bends?: Record<string, Array<{ x: number; y: number }>>;
}

export interface NetworkDto {
  template: MapTemplateSummary;
  lines: NetworkLineDto[];
  stations: NetworkStationDto[];
}

export async function listMapTemplates(): Promise<MapTemplateSummary[]> {
  const rows = await MapTemplate.findAll({
    attributes: ["id", "name", "description", "nodeCount"],
    order: [["name", "ASC"]],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    nodeCount: row.nodeCount,
  }));
}

export async function loadMapTemplateById(
  templateId: string,
): Promise<NetworkDto | null> {
  const template = await MapTemplate.findByPk(templateId, {
    include: [
      {
        model: MapTemplateNode,
        include: [{ model: MapTemplateLine, through: { attributes: [] } }],
      },
      {
        model: MapTemplateLine,
        separate: true,
        order: [["sortOrder", "ASC"]],
      },
    ],
  });
  if (!template) {
    return null;
  }
  return toNetworkDto(template);
}

export async function loadDefaultMapTemplate(): Promise<NetworkDto | null> {
  const template = await MapTemplate.findOne({
    where: { name: DEFAULT_TEMPLATE_NAME },
    include: [
      {
        model: MapTemplateNode,
        include: [{ model: MapTemplateLine, through: { attributes: [] } }],
      },
      {
        model: MapTemplateLine,
        separate: true,
        order: [["sortOrder", "ASC"]],
      },
    ],
  });
  if (!template) {
    const fallback = await MapTemplate.findOne({
      order: [["createdAt", "ASC"]],
      include: [
        {
          model: MapTemplateNode,
          include: [{ model: MapTemplateLine, through: { attributes: [] } }],
        },
        {
          model: MapTemplateLine,
          separate: true,
          order: [["sortOrder", "ASC"]],
        },
      ],
    });
    if (!fallback) {
      return null;
    }
    return toNetworkDto(fallback);
  }
  return toNetworkDto(template);
}

function toNetworkDto(template: MapTemplate): NetworkDto {
  const lineOrder = new Map(
    (template.lines ?? []).map((line, index) => [line.code, index]),
  );

  const stations: NetworkStationDto[] = (template.nodes ?? []).map((node) => {
    const lineIds = (node.lines ?? [])
      .map((line) => line.code)
      .sort(
        (a, b) =>
          (lineOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (lineOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
      );

    const station: NetworkStationDto = {
      id: node.code,
      name: node.name,
      x: node.coordinateX,
      y: node.coordinateY,
      lineIds,
      isInterchange: node.isInterchange,
      latitude: node.latitude,
      longitude: node.longitude,
    };
    if (node.labelAnchor) {
      station.labelAnchor = node.labelAnchor;
    }
    if (node.labelRotate != null) {
      station.labelRotate = node.labelRotate;
    }
    return station;
  });

  const lines: NetworkLineDto[] = (template.lines ?? []).map((line) => {
    const meta = line.renderMetadata;
    const dto: NetworkLineDto = {
      id: line.code,
      name: line.name ?? line.code,
      shortName: line.shortName ?? line.code,
      color: line.color ?? "#000000",
      stationIds: meta?.stationIds ?? [],
    };
    const bends = meta?.bends;
    if (bends && Object.keys(bends).length > 0) {
      dto.bends = bends;
    }
    return dto;
  });

  return {
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      nodeCount: template.nodeCount,
    },
    lines,
    stations,
  };
}
