import { useRef } from "react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import type { Network } from "../data/types";
import { SubwaySvg } from "./SubwaySvg";

interface Props {
  network: Network;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
}

const MIN_SCALE = 2;
const MAX_SCALE = 30;

function ZoomControls() {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();

  return (
    <div className="map-shell__controls" aria-label="Map zoom controls">
      <button
        type="button"
        className="map-shell__fab"
        aria-label="Zoom in"
        onClick={() => zoomIn(0.4)}
      >
        +
      </button>
      <button
        type="button"
        className="map-shell__fab"
        aria-label="Zoom out"
        onClick={() => zoomOut(0.4)}
      >
        −
      </button>
      <button
        type="button"
        className="map-shell__fab map-shell__fab--secondary"
        aria-label="Reset view"
        onClick={() => {
          resetTransform();
          centerView(1, 300, "easeOut");
        }}
      >
        ⤾
      </button>
    </div>
  );
}

export function MapShell({ network, selectedStationId, onSelectStation }: Props) {
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);

  return (
    <div className="map-shell">
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        centerOnInit
        limitToBounds={false}
        wheel={{ step: 0.12 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: "zoomIn", step: 0.7, animationTime: 200 }}
        panning={{ velocityDisabled: false, excluded: ["station-marker"] }}
        velocityAnimation={{ animationTime: 220 }}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="map-shell__viewport"
          contentClass="map-shell__content"
        >
          <SubwaySvg
            network={network}
            selectedStationId={selectedStationId}
            onSelectStation={onSelectStation}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
