import type { Network } from "../data/types";
import { LineLayer } from "./LineLayer";
import { StationMarker } from "./StationMarker";

interface Props {
  network: Network;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
}

export const VIEW_BOX_WIDTH = 1200;
export const VIEW_BOX_HEIGHT = 800;

export function SubwaySvg({ network, selectedStationId, onSelectStation }: Props) {
  return (
    <svg
      className="subway-svg"
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
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
            isSelected={selectedStationId === station.id}
            onSelect={onSelectStation}
          />
        ))}
      </g>
    </svg>
  );
}
