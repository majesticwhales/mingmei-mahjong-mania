import type { LineId, Network, Station } from "../data/types";

interface Props {
  network: Network;
  strokeWidth?: number;
  /**
   * Curve tightness applied to segments that touch a `bends` waypoint.
   * `0` produces a straight polyline; `0.25`-`0.4` gives the subway-map look
   * with visibly rounded corners; values above `0.5` tend to overshoot.
   * Station-to-station segments always render as straight `L` lines and ignore
   * this value.
   */
  smoothing?: number;
}

interface Vec {
  x: number;
  y: number;
}

interface TaggedPoint {
  x: number;
  y: number;
  isBend: boolean;
}

function segmentKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Build an SVG path that goes through every point. Station-to-station segments
 * use straight lines (`L`); any segment touching a `bends` waypoint uses a
 * cubic-Bezier curve (`C`) so the bend region reads as a smooth arc that
 * tangentially flows into the adjacent straight legs.
 */
function buildPath(points: TaggedPoint[], smoothing: number): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  if (points.length === 1) return d;

  const tangents: Vec[] = points.map((p, i) => {
    const prev = points[i - 1] ?? p;
    const next = points[i + 1] ?? p;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
  });

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (!p1.isBend && !p2.isBend) {
      d += ` L ${p2.x} ${p2.y}`;
      continue;
    }

    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const k = segLen * smoothing;
    const c1x = p1.x + tangents[i].x * k;
    const c1y = p1.y + tangents[i].y * k;
    const c2x = p2.x - tangents[i + 1].x * k;
    const c2y = p2.y - tangents[i + 1].y * k;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function LineLayer({ network, strokeWidth = 7, smoothing = 0.35 }: Props) {
  const stationsById = new Map(network.stations.map((s) => [s.id, s]));
  const colorByLine = new Map(network.lines.map((l) => [l.id, l.color]));

  // Find consecutive station pairs that appear on more than one line. These
  // shared segments are skipped in each line's main path and rendered below
  // as equal-length stripes coloured per contributing line.
  const segmentLines = new Map<string, LineId[]>();
  for (const line of network.lines) {
    for (let i = 0; i < line.stationIds.length - 1; i++) {
      const key = segmentKey(line.stationIds[i], line.stationIds[i + 1]);
      const arr = segmentLines.get(key) ?? [];
      arr.push(line.id);
      segmentLines.set(key, arr);
    }
  }
  const sharedSegments = Array.from(segmentLines.entries())
    .filter(([, lines]) => lines.length > 1)
    .map(([key, lines]) => {
      const [a, b] = key.split("|");
      return { a, b, lineIds: lines };
    });
  const sharedKeys = new Set(sharedSegments.map((s) => segmentKey(s.a, s.b)));

  return (
    <g>
      {network.lines.flatMap((line) => {
        // Split the line into sub-paths, breaking at any shared segment.
        const subPaths: TaggedPoint[][] = [];
        let current: TaggedPoint[] = [];

        for (let i = 0; i < line.stationIds.length; i++) {
          const id = line.stationIds[i];
          const station: Station | undefined = stationsById.get(id);
          if (!station) continue;
          current.push({ x: station.x, y: station.y, isBend: false });

          const nextId = line.stationIds[i + 1];
          const breakHere =
            nextId !== undefined && sharedKeys.has(segmentKey(id, nextId));

          if (!breakHere) {
            const bends = line.bends?.[id];
            if (bends) {
              for (const b of bends) {
                current.push({ x: b.x, y: b.y, isBend: true });
              }
            }
          } else {
            if (current.length > 0) subPaths.push(current);
            current = [];
          }
        }
        if (current.length > 0) subPaths.push(current);

        return subPaths.map((seg, idx) => (
          <path
            key={`${line.id}-${idx}`}
            d={buildPath(seg, smoothing)}
            fill="none"
            stroke={line.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ));
      })}
      {sharedSegments.flatMap(({ a, b, lineIds }) => {
        const stationA = stationsById.get(a);
        const stationB = stationsById.get(b);
        if (!stationA || !stationB) return [];
        const dx = stationB.x - stationA.x;
        const dy = stationB.y - stationA.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return [];
        // Perpendicular unit vector (rotate the segment direction 90° CCW).
        const px = -dy / len;
        const py = dx / len;
        const stripeWidth = strokeWidth / lineIds.length;
        return lineIds.map((lineId, i) => {
          // Centered offset: for two stripes -> -0.5, +0.5; for three -> -1, 0, +1.
          const t = i - (lineIds.length - 1) / 2;
          const ox = px * t * stripeWidth;
          const oy = py * t * stripeWidth;
          return (
            <line
              key={`shared-${a}-${b}-${lineId}`}
              x1={stationA.x + ox}
              y1={stationA.y + oy}
              x2={stationB.x + ox}
              y2={stationB.y + oy}
              stroke={colorByLine.get(lineId)}
              strokeWidth={stripeWidth}
              strokeLinecap="butt"
            />
          );
        });
      })}
    </g>
  );
}
