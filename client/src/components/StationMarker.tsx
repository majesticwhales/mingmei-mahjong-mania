import type { KeyboardEvent } from "react";
import type { LabelAnchor, Station } from "../data/types";

interface Props {
  station: Station;
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

function defaultAnchor(station: Station): LabelAnchor {
  if (station.isInterchange) return "n";
  if (station.lineIds.includes("1")) return "e";
  return "n";
}

/**
 * Stations that sit on a single line along the dense east-west run of Line 2
 * or Line 5 default to a `-30deg` rotated label, matching the diagonal-text
 * style of the printed TTC map. Explicit `labelRotate: 0` opts back out.
 */
function defaultRotate(station: Station, anchor: LabelAnchor): number {
  if (anchor !== "n" && anchor !== "s") return 0;
  if (station.isInterchange) return 0;
  if (station.lineIds.length !== 1) return 0;
  const only = station.lineIds[0];
  if (only === "2" || only === "5") return -30;
  return 0;
}

export function StationMarker({ station, isSelected, onSelect }: Props) {
  const isInterchange = station.isInterchange;
  const anchor = station.labelAnchor ?? defaultAnchor(station);
  const placement = LABEL_OFFSETS[anchor];
  let labelX = station.x + placement.dx;
  let labelY = station.y + placement.dy;
  let textAnchor = placement.textAnchor;
  let labelTransform: string | undefined;

  // Diagonal-rotated labels for dense horizontal runs. The label anchor is
  // offset PERPENDICULAR to the line first, then the rotation pivots in
  // place. The perpendicular offsets are asymmetric: south-side labels need
  // a larger gap because the rotation tilts the text's ascent UP-toward the
  // line (regardless of rotation direction), eating most of the gap, while
  // north-side labels rotate ascent FURTHER from the line. The diagonal
  // anchors (ne/nw/se/sw) shift the label an extra ~8 units along the line
  // before rotating, useful for nudging interchange labels clear of their
  // own ring.
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

  const handleKey = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(station.id);
    }
  };

  return (
    <g
      className={`station-marker${isSelected ? " station-marker--selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${station.name}${isInterchange ? " (interchange)" : ""}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(station.id)}
      onKeyDown={handleKey}
    >
      {/* invisible larger hit area for fat-finger tapping */}
      <circle cx={station.x} cy={station.y} r={14} fill="transparent" />

      {isInterchange ? (
        <>
          <circle
            cx={station.x}
            cy={station.y}
            r={7}
            fill="#fff"
            stroke="#111"
            strokeWidth={2}
          />
          <circle cx={station.x} cy={station.y} r={3} fill="#111" />
        </>
      ) : (
        <circle
          cx={station.x}
          cy={station.y}
          r={4}
          fill="#fff"
          stroke="#111"
          strokeWidth={1.5}
        />
      )}

      {isSelected && (
        <circle
          cx={station.x}
          cy={station.y}
          r={isInterchange ? 12 : 9}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
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
