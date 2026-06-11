import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { TILES_PER_STATION } from "../data/tileStations";
import type { LabelAnchor, Station } from "../data/types";

export interface TileSlotDisplay {
  imagePath: string;
  label?: string;
  visible: boolean;
  /**
   * Phase L §3.13: claim-unlock timer state, mirrored from
   * `MapNodeTileDto.locked`. Independent of `visible` — a slot can be
   * both visible AND locked (preview tier). When true, the marker
   * stamps `data-locked="true"` on the slot wrapper so styling can
   * grey the frame / show a lock affordance without changing layout.
   */
  locked?: boolean;
}

interface Props {
  station: Station;
  variant: "tiles" | "dot";
  tileSlots?: readonly TileSlotDisplay[];
  isSelected: boolean;
  onSelect: (id: string) => void;
}

interface LabelPlacement {
  dx: number;
  dy: number;
  textAnchor: "start" | "middle" | "end";
}

const LABEL_OFFSETS: Record<LabelAnchor, LabelPlacement> = {
  e: { dx: 11, dy: 3.5, textAnchor: "start" },
  w: { dx: -11, dy: 3.5, textAnchor: "end" },
  n: { dx: 0, dy: -12, textAnchor: "middle" },
  s: { dx: 0, dy: 19, textAnchor: "middle" },
  ne: { dx: 10, dy: -10, textAnchor: "start" },
  nw: { dx: -10, dy: -10, textAnchor: "end" },
  se: { dx: 10, dy: 18, textAnchor: "start" },
  sw: { dx: -10, dy: 18, textAnchor: "end" },
};

const SLOT_WIDTH = 11;
const SLOT_HEIGHT = 15;
const SLOT_GAP = 1;
const SLOT_GROUP_WIDTH = SLOT_WIDTH * TILES_PER_STATION + SLOT_GAP * (TILES_PER_STATION - 1);
const TILE_LABEL_GAP = 6;
const TILE_HALF_WIDTH = SLOT_GROUP_WIDTH / 2;

function horizontalTileLabelInset(variant: "tiles" | "dot") {
  return variant === "tiles" ? TILE_HALF_WIDTH + TILE_LABEL_GAP : 0;
}

function resolveLabelPlacement(
  anchor: LabelAnchor,
  variant: "tiles" | "dot",
): LabelPlacement {
  const base = LABEL_OFFSETS[anchor];
  const inset = horizontalTileLabelInset(variant);
  if (inset === 0) {
    return base;
  }
  switch (anchor) {
    case "w":
      return { ...base, dx: base.dx - inset };
    case "e":
      return { ...base, dx: base.dx + inset };
    default:
      return base;
  }
}

function defaultAnchor(station: Station): LabelAnchor {
  if (station.isInterchange) return "n";
  if (station.lineIds.includes("1")) return "e";
  return "n";
}

function defaultRotate(station: Station, anchor: LabelAnchor): number {
  if (anchor !== "n" && anchor !== "s") return 0;
  if (station.isInterchange) return 0;
  if (station.lineIds.length !== 1) return 0;
  const only = station.lineIds[0];
  if (only === "2" || only === "5") return -30;
  return 0;
}

function markerAriaLabel(
  station: Station,
  variant: Props["variant"],
  tileSlots: readonly TileSlotDisplay[] | undefined,
) {
  const parts = [station.name];
  if (variant === "tiles" && tileSlots) {
    const visibleLabels = tileSlots
      .map((slot, index) => (slot.visible && slot.label ? `slot ${index + 1}: ${slot.label}` : null))
      .filter((label): label is string => label != null);
    if (visibleLabels.length > 0) {
      parts.push(visibleLabels.join(", "));
    } else {
      parts.push("3 tile slots");
    }
  }
  if (station.isInterchange) parts.push("(interchange)");
  return parts.join(", ");
}

export function StationMarker({
  station,
  variant,
  tileSlots,
  isSelected,
  onSelect,
}: Props) {
  const markerRef = useRef<SVGGElement>(null);
  const anchor = station.labelAnchor ?? defaultAnchor(station);
  const placement = resolveLabelPlacement(anchor, variant);
  let labelX = station.x + placement.dx;
  let labelY = station.y + placement.dy;
  let textAnchor = placement.textAnchor;
  let labelTransform: string | undefined;
  const rotation = station.labelRotate ?? defaultRotate(station, anchor);

  if (
    rotation !== 0 &&
    (anchor === "n" ||
      anchor === "s" ||
      anchor === "ne" ||
      anchor === "nw" ||
      anchor === "se" ||
      anchor === "sw")
  ) {
    if (anchor === "n") {
      labelX = station.x + 4;
      labelY = station.y - 11;
      textAnchor = "start";
    } else if (anchor === "ne") {
      labelX = station.x + 12;
      labelY = station.y - 9;
      textAnchor = "start";
    } else if (anchor === "nw") {
      labelX = station.x - 12;
      labelY = station.y - 9;
      textAnchor = "end";
    } else if (anchor === "s") {
      labelX = station.x - 4;
      labelY = station.y + 14;
      textAnchor = "end";
    } else if (anchor === "se") {
      labelX = station.x + 12;
      labelY = station.y + 12;
      textAnchor = "start";
    } else {
      labelX = station.x - 12;
      labelY = station.y + 12;
      textAnchor = "end";
    }
    labelTransform = `rotate(${rotation} ${labelX} ${labelY})`;
  }

  useEffect(() => {
    if (isSelected && document.activeElement !== markerRef.current) {
      markerRef.current?.focus({ preventScroll: true });
    }
  }, [isSelected]);

  const handleKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(station.id);
    }
  };

  const anyTileVisible = tileSlots?.some((slot) => slot.visible) ?? false;
  const markerClassName = [
    "station-marker",
    variant === "dot" ? "station-marker--dot" : "station-marker--tiles",
    isSelected ? "station-marker--selected" : "",
    variant === "tiles" && !anyTileVisible ? "station-marker--hidden-tile" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const haloBounds =
    variant === "dot"
      ? {
          x: station.x - 7,
          y: station.y - 7,
          width: 14,
          height: 14,
          rx: 7,
        }
      : {
          x: station.x - SLOT_GROUP_WIDTH / 2 - 3,
          y: station.y - SLOT_HEIGHT / 2 - 3,
          width: SLOT_GROUP_WIDTH + 6,
          height: SLOT_HEIGHT + 6,
          rx: 4,
        };

  const handleClick = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation();
    onSelect(station.id);
  };

  return (
    <g
      ref={markerRef}
      className={markerClassName}
      role="button"
      tabIndex={0}
      aria-label={markerAriaLabel(station, variant, tileSlots)}
      aria-pressed={isSelected}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <circle cx={station.x} cy={station.y} r={14} fill="transparent" />
      {variant === "dot" ? (
        <circle
          className="station-marker__dot"
          cx={station.x}
          cy={station.y}
          r={station.isInterchange ? 5 : 4.25}
          aria-hidden="true"
        />
      ) : (
        <g
          className="station-marker__tile-slots"
          transform={`translate(${station.x - SLOT_GROUP_WIDTH / 2} ${station.y - SLOT_HEIGHT / 2})`}
        >
          {Array.from({ length: TILES_PER_STATION }, (_, slotIndex) => {
            const slot = tileSlots?.[slotIndex];
            const imagePath = slot?.imagePath ?? TILE_BACK_IMAGE_PATH;
            const x = slotIndex * (SLOT_WIDTH + SLOT_GAP);
            const className = [
              "station-marker__tile-slot",
              slot?.visible ? "" : "station-marker__tile-slot--hidden",
              slot?.locked ? "station-marker__tile-slot--locked" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <g
                key={slotIndex}
                className={className}
                transform={`translate(${x} 0)`}
                data-locked={slot?.locked ? "true" : undefined}
              >
                <rect
                  className="station-marker__tile-shadow"
                  x={0.8}
                  y={1.1}
                  width={SLOT_WIDTH}
                  height={SLOT_HEIGHT}
                  rx={1.8}
                  aria-hidden="true"
                />
                <rect
                  className="station-marker__tile-frame"
                  width={SLOT_WIDTH}
                  height={SLOT_HEIGHT}
                  rx={1.8}
                  aria-hidden="true"
                />
                <image
                  href={imagePath}
                  x={1.2}
                  y={1.5}
                  width={SLOT_WIDTH - 2.4}
                  height={SLOT_HEIGHT - 3}
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden="true"
                />
              </g>
            );
          })}
        </g>
      )}
      {isSelected && (
        <rect
          x={haloBounds.x}
          y={haloBounds.y}
          width={haloBounds.width}
          height={haloBounds.height}
          rx={haloBounds.rx}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.2}
          className="station-marker__halo"
        />
      )}
      <text
        x={labelX}
        y={labelY}
        textAnchor={textAnchor}
        transform={labelTransform}
        className="station-marker__label"
      >
        {station.name}
      </text>
    </g>
  );
}
