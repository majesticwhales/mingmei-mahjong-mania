import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import type { Network } from "../data/types";
import { tileImagePath } from "../lib/tileImages";
import type { MapNodeDto } from "../wire/projection";
import { LineLayer } from "./LineLayer";
import { StationMarker } from "./StationMarker";

interface Props {
  network: Network;
  mapNodes?: MapNodeDto[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onMapBackgroundClick?: () => void;
}

export const VIEW_BOX_MIN_X = -125;
export const VIEW_BOX_MIN_Y = -35;
export const VIEW_BOX_WIDTH = 1320;
export const VIEW_BOX_HEIGHT = 920;

function nodeTileImage(node: MapNodeDto | undefined) {
  if (!node) return TILE_BACK_IMAGE_PATH;
  if (node.tile) return tileImagePath(node.tile);
  if (node.tiles?.[0]) return tileImagePath(node.tiles[0].tile);
  return TILE_BACK_IMAGE_PATH;
}

function nodeTileVisible(node: MapNodeDto | undefined) {
  return Boolean(node?.tile || node?.tiles?.length);
}

export function SubwaySvg({
  network,
  mapNodes,
  selectedStationId,
  onSelectStation,
  onMapBackgroundClick,
}: Props) {
  const nodesById = new Map((mapNodes ?? []).map((node) => [node.id, node]));

  return (
    <svg
      className="subway-svg"
      viewBox={`${VIEW_BOX_MIN_X} ${VIEW_BOX_MIN_Y} ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Subway map"
      onClick={onMapBackgroundClick}
    >
      <LineLayer network={network} />
      <g>
        {network.stations.map((station) => {
          const node = nodesById.get(station.id);
          return (
            <StationMarker
              key={station.id}
              station={station}
              tileImagePath={nodeTileImage(node)}
              tileLabel={node?.tile?.displayName ?? node?.tiles?.[0]?.tile.displayName}
              isTileVisible={nodeTileVisible(node)}
              isSelected={selectedStationId === station.id}
              onSelect={onSelectStation}
            />
          );
        })}
      </g>
    </svg>
  );
}
