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

/**
 * Phase L §3.13: the server resolves per-slot visibility / locked state
 * and emits one `MapNodeTileDto` per slot in `node.tiles[]`. The client
 * only translates the wire shape into the renderer's `TileSlotDisplay`.
 * The pre-Phase-L phase-math helpers (and the `visibilityPhase` /
 * `visibilityPhaseCount` / `phaseDrivenSlotMap` props they consumed)
 * are gone from this component — those fields are projection-level
 * telemetry now ([projection.ts](../wire/projection.ts)) and the
 * `<GameTimer />` / event-log surfaces are their only consumers.
 */
function buildTileSlots(node: MapNodeDto | undefined): TileSlotDisplay[] {
  const slots = emptyTileSlots();
  if (!node) return slots;

  for (const entry of node.tiles) {
    if (entry.slotIndex < 0 || entry.slotIndex >= TILES_PER_STATION) continue;
    if (entry.visible && entry.tile != null) {
      slots[entry.slotIndex] = {
        imagePath: tileImagePath(entry.tile),
        label: entry.tile.displayName,
        visible: true,
        locked: entry.locked,
      };
    } else if (entry.visible && entry.tile == null) {
      // Revealed but vacated — e.g. another team claimed their 14th tile.
      slots[entry.slotIndex] = {
        imagePath: TILE_BACK_IMAGE_PATH,
        visible: true,
        empty: true,
      };
    } else {
      // Hidden slot — render face-down. Carry `locked` through so the
      // marker can stamp the lock affordance even before reveal.
      slots[entry.slotIndex] = {
        imagePath: TILE_BACK_IMAGE_PATH,
        visible: false,
        locked: entry.locked,
      };
    }
  }
  return slots;
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
          const tileStation = isTileStation(station.code);
          return (
            <StationMarker
              key={station.id}
              station={station}
              variant={tileStation ? "tiles" : "dot"}
              tileSlots={tileStation ? buildTileSlots(node) : undefined}
              isSelected={selectedStationId === station.id}
              onSelect={onSelectStation}
            />
          );
        })}
      </g>
    </svg>
  );
}
