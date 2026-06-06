import type { MapEdgeDto, MapLineDto, MapNodeDto } from "../wire/projection";
import type { LabelAnchor, Network, Station, SubwayLine } from "../data/types";

function toLabelAnchor(value: string): LabelAnchor {
  const anchors: LabelAnchor[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  return anchors.includes(value as LabelAnchor) ? (value as LabelAnchor) : "n";
}

export function projectionToNetwork(
  mapNodes: MapNodeDto[],
  mapLines: MapLineDto[],
  mapEdges: MapEdgeDto[],
): Network {
  const lineOrder = [...mapLines].sort((a, b) => a.sortOrder - b.sortOrder);
  const edgesByFrom = new Map<string, string[]>();
  for (const edge of mapEdges) {
    const list = edgesByFrom.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    edgesByFrom.set(edge.fromNodeId, list);
  }

  const lines: SubwayLine[] = lineOrder.map((line) => {
    const stationIds = mapNodes
      .filter((node) => node.lineIds.includes(line.code))
      .map((node) => node.id);
    const renderMetadata = line.renderMetadata as { bends?: SubwayLine["bends"] } | null;
    return {
      id: line.code as SubwayLine["id"],
      name: line.name ?? line.code,
      shortName: line.shortName ?? line.code,
      color: line.color ?? "#888",
      stationIds,
      bends: renderMetadata?.bends,
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
