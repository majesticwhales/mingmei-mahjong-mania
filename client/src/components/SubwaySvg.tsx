import { getStationTile, type RiichiTileCopy } from "../data/riichiTiles";
import type { Network } from "../data/types";
import { LineLayer } from "./LineLayer";
import { StationMarker } from "./StationMarker";

interface Props {
  network: Network;
  selectedStationId: string | null;
  tileWall: readonly RiichiTileCopy[];
  onSelectStation: (id: string) => void;
}

// Station extents in the seeded TTC map are roughly x ∈ [25, 1045] and
// y ∈ [115, 685]. The viewBox extends 150 units past those extents on every
// side so the empty padding becomes part of the SVG itself; that means the
// zoom/pan library's `limitToBounds` clamps panning to the padded edge rather
// than tightly hugging the outermost stations.
export const VIEW_BOX_MIN_X = -125;
export const VIEW_BOX_MIN_Y = -35;
export const VIEW_BOX_WIDTH = 1320;
export const VIEW_BOX_HEIGHT = 870;

export function SubwaySvg({
  network,
  selectedStationId,
  tileWall,
  onSelectStation,
}: Props) {
  return (
    <svg
      className="subway-svg"
      viewBox={`${VIEW_BOX_MIN_X} ${VIEW_BOX_MIN_Y} ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Toronto 2026 TTC subway and LRT map"
    >
      <LineLayer network={network} />
      <g>
        {network.stations.map((station) => (
          <StationMarker
            key={station.id}
            station={station}
            tile={getStationTile(network.stations, station.id, tileWall)}
            isSelected={selectedStationId === station.id}
            onSelect={onSelectStation}
          />
        ))}
      </g>
    </svg>
  );
}
