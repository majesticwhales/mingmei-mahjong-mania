import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { isTileStation, TILES_PER_STATION } from "../data/tileStations";
import type { Network } from "../data/types";
import { tileImagePath } from "../lib/tileImages";
import type { MapNodeDto } from "../wire/projection";
import { LineLayer } from "./LineLayer";
import { StationMarker, type TileSlotDisplay } from "./StationMarker";

interface Props {
  network: Network;
  mapNodes?: MapNodeDto[];
  visibilityPhase: number;
  visibilityPhaseCount: number;
  phaseDrivenSlotMap: boolean;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onMapBackgroundClick?: () => void;
}

export const VIEW_BOX_MIN_X = -125;
export const VIEW_BOX_MIN_Y = -35;
export const VIEW_BOX_WIDTH = 1320;
export const VIEW_BOX_HEIGHT = 920;

function emptyTileSlots(): TileSlotDisplay[] {
  return Array.from({ length: TILES_PER_STATION }, () => ({
    imagePath: TILE_BACK_IMAGE_PATH,
    visible: false,
  }));
}

function applyPhaseSlotVisibility(
  slots: TileSlotDisplay[],
  visibilityPhase: number,
  visibilityPhaseCount: number,
): TileSlotDisplay[] {
  if (visibilityPhaseCount !== TILES_PER_STATION) {
    return slots;
  }
  const activeSlot = Math.min(
    Math.max(visibilityPhase, 0),
    TILES_PER_STATION - 1,
  );
  return slots.map((slot, index) => ({
    ...slot,
    visible: index === activeSlot && slot.visible,
  }));
}

function buildTileSlots(
  node: MapNodeDto | undefined,
  visibilityPhase: number,
  visibilityPhaseCount: number,
  phaseDrivenSlotMap: boolean,
): TileSlotDisplay[] {
  const slots = emptyTileSlots();
  const activeSlot = Math.min(
    Math.max(visibilityPhase, 0),
    TILES_PER_STATION - 1,
  );

  if (node?.tiles) {
    for (const entry of node.tiles) {
      if (entry.slotIndex < 0 || entry.slotIndex >= TILES_PER_STATION) continue;
      slots[entry.slotIndex] = {
        imagePath: tileImagePath(entry.tile),
        label: entry.tile.displayName,
        visible: true,
      };
    }
    if (phaseDrivenSlotMap) {
      return applyPhaseSlotVisibility(slots, visibilityPhase, visibilityPhaseCount);
    }
    return slots;
  }

  if (node?.tile) {
    const targetIndex = phaseDrivenSlotMap ? activeSlot : 0;
    slots[targetIndex] = {
      imagePath: tileImagePath(node.tile),
      label: node.tile.displayName,
      visible: true,
    };
    if (phaseDrivenSlotMap) {
      return applyPhaseSlotVisibility(slots, visibilityPhase, visibilityPhaseCount);
    }
    return slots;
  }

  return slots;
}

export function SubwaySvg({
  network,
  mapNodes,
  visibilityPhase,
  visibilityPhaseCount,
  phaseDrivenSlotMap,
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
          const tileStation = isTileStation(station.code);
          return (
            <StationMarker
              key={station.id}
              station={station}
              variant={tileStation ? "tiles" : "dot"}
              tileSlots={
                tileStation
                  ? buildTileSlots(
                      node,
                      visibilityPhase,
                      visibilityPhaseCount,
                      phaseDrivenSlotMap,
                    )
                  : undefined
              }
              isSelected={selectedStationId === station.id}
              onSelect={onSelectStation}
            />
          );
        })}
      </g>
    </svg>
  );
}
