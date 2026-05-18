import { useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchContentRef,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import type { PlayerViewMode } from "../data/playerViews";
import type { RiichiTileCopy } from "../data/riichiTiles";
import type { Network } from "../data/types";
import { SubwaySvg } from "./SubwaySvg";

interface Props {
  network: Network;
  selectedStationId: string | null;
  tileWall: readonly RiichiTileCopy[];
  viewMode: PlayerViewMode;
  onSelectStation: (id: string) => void;
}

const MIN_SCALE = 3;
const MAX_SCALE = 30;
const MIN_SCALE_EPSILON = 0.001;

function isMinScale(scale: number) {
  return scale <= MIN_SCALE + MIN_SCALE_EPSILON;
}

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
          centerView(MIN_SCALE, 300, "easeOut");
        }}
      >
        ⤾
      </button>
    </div>
  );
}

export function MapShell({
  network,
  selectedStationId,
  tileWall,
  viewMode,
  onSelectStation,
}: Props) {
  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
  const [isAtMinZoom, setIsAtMinZoom] = useState(true);

  function handleTransform(_ref: ReactZoomPanPinchRef, state: { scale: number }) {
    const nextIsAtMinZoom = isMinScale(state.scale);
    setIsAtMinZoom((current) =>
      current === nextIsAtMinZoom ? current : nextIsAtMinZoom,
    );
  }

  function recenterAtMinZoom(ref: ReactZoomPanPinchRef) {
    if (isMinScale(ref.state.scale)) {
      ref.centerView(MIN_SCALE, 160, "easeOut");
    }
  }

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
        pinch={{ step: 5, allowPanning: !isAtMinZoom }}
        doubleClick={{ mode: "zoomIn", step: 0.7, animationTime: 200 }}
        panning={{
          disabled: isAtMinZoom,
          velocityDisabled: isAtMinZoom,
          excluded: ["station-marker"],
        }}
        velocityAnimation={{ disabled: isAtMinZoom, animationTime: 220 }}
        onInit={recenterAtMinZoom}
        onTransform={handleTransform}
        onZoomStop={recenterAtMinZoom}
      >
        <ZoomControls />
        <TransformComponent
          wrapperClass="map-shell__viewport"
          contentClass="map-shell__content"
        >
          <SubwaySvg
            network={network}
            selectedStationId={selectedStationId}
            tileWall={tileWall}
            viewMode={viewMode}
            onSelectStation={onSelectStation}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
