import { useRef } from "react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import type { Network } from "../data/types";
import type { MapNodeDto } from "../wire/projection";
import { SubwaySvg } from "./SubwaySvg";

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

const MIN_SCALE = 1.5;
const MAX_SCALE = 30;

function ZoomControls() {
  const { zoomIn, zoomOut } = useControls();

  return (
    <div className="map-shell__controls" aria-label="Map zoom controls">
      <button type="button" className="map-shell__fab" aria-label="Zoom in" onClick={() => zoomIn(0.4)}>
        +
      </button>
      <button type="button" className="map-shell__fab" aria-label="Zoom out" onClick={() => zoomOut(0.4)}>
        −
      </button>
    </div>
  );
}

export function MapShell({
  network,
  mapNodes,
  visibilityPhase,
  visibilityPhaseCount,
  phaseDrivenSlotMap,
  selectedStationId,
  onSelectStation,
  onMapBackgroundClick,
}: Props) {
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);

  return (
    <div className="map-shell">
      <TransformWrapper
        ref={transformRef}
        initialScale={MIN_SCALE}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        centerOnInit
        centerZoomedOut
        limitToBounds
        wheel={{ step: 0.12 }}
        pinch={{ step: 5, allowPanning: true }}
        doubleClick={{ mode: "zoomIn", step: 0.7, animationTime: 200 }}
        panning={{
          disabled: false,
          velocityDisabled: false,
          excluded: ["station-marker"],
        }}
        velocityAnimation={{ animationTime: 220 }}
      >
        <ZoomControls />
        <TransformComponent wrapperClass="map-shell__viewport" contentClass="map-shell__content">
          <SubwaySvg
            network={network}
            mapNodes={mapNodes}
            visibilityPhase={visibilityPhase}
            visibilityPhaseCount={visibilityPhaseCount}
            phaseDrivenSlotMap={phaseDrivenSlotMap}
            selectedStationId={selectedStationId}
            onSelectStation={onSelectStation}
            onMapBackgroundClick={onMapBackgroundClick}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
