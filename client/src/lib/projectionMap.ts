import type { MapEdgeDto, MapLineDto, MapNodeDto } from "../wire/projection";
import type { LabelAnchor, Network, Station, SubwayLine } from "../data/types";

function toLabelAnchor(value: string): LabelAnchor {
  const anchors: LabelAnchor[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  return anchors.includes(value as LabelAnchor) ? (value as LabelAnchor) : "n";
}

function remapBendsByNodeId(
  bends: SubwayLine["bends"] | undefined,
  nodeIdByCode: Map<string, string>,
): SubwayLine["bends"] | undefined {
  if (!bends) return undefined;
  const remapped: NonNullable<SubwayLine["bends"]> = {};
  for (const [code, points] of Object.entries(bends)) {
    const nodeId = nodeIdByCode.get(code);
    if (nodeId) remapped[nodeId] = points;
  }
  return Object.keys(remapped).length > 0 ? remapped : undefined;
}

export function projectionToNetwork(
  mapNodes: MapNodeDto[],
  mapLines: MapLineDto[],
  _mapEdges: MapEdgeDto[],
): Network {
  const lineOrder = [...mapLines].sort((a, b) => a.sortOrder - b.sortOrder);
  const nodeIdByCode = new Map(mapNodes.map((node) => [node.code, node.id]));

  const lines: SubwayLine[] = lineOrder.map((line) => {
    const renderMetadata = line.renderMetadata as {
      stationIds?: string[];
      bends?: SubwayLine["bends"];
    } | null;
    const templateStationIds = renderMetadata?.stationIds ?? [];
    const stationIds =
      templateStationIds.length > 0
        ? templateStationIds
            .map((code) => nodeIdByCode.get(code))
            .filter((id): id is string => id != null)
        : mapNodes
            .filter((node) => node.lineIds.includes(line.code))
            .map((node) => node.id);
    return {
      id: line.code as SubwayLine["id"],
      name: line.name ?? line.code,
      shortName: line.shortName ?? line.code,
      color: line.color ?? "#888",
      stationIds,
      bends: remapBendsByNodeId(renderMetadata?.bends, nodeIdByCode),
    };
  });

  const stations: Station[] = mapNodes.map((node) => ({
    id: node.id,
    name: node.name,
    x: node.coordinateX,
    y: node.coordinateY,
    lineIds: node.lineIds as Station["lineIds"],
    isInterchange: node.isInterchange,
    labelAnchor: toLabelAnchor(node.labelAnchor),
    labelRotate: node.labelRotate ?? undefined,
  }));

  return { lines, stations };
}
