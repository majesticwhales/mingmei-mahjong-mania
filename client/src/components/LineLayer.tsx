import type { Network, Point, Station } from "../data/types";

interface Props {
  network: Network;
  strokeWidth?: number;
  /**
   * Curve tightness. `0` produces a straight polyline; `0.25`-`0.4` gives the
   * subway-map look with visibly rounded corners; values above `0.5` tend to
   * overshoot at sharp turns.
   */
  smoothing?: number;
}

interface Vec {
  x: number;
  y: number;
}

/**
 * Build a smooth cubic-Bezier path that passes through EVERY anchor point in
 * `points`. The tangent at each anchor is taken from the unit vector between
 * its two neighbors, then scaled by the adjacent segment length and the
 * `smoothing` factor. The result is:
 *
 *   - Collinear stretches stay perfectly straight (the averaged tangent is
 *     along the line, so the Bezier controls fall on the line as well).
 *   - Direction changes round off smoothly through the corner station.
 *   - Every station and bend sits exactly on the rendered curve.
 */
function buildSmoothPath(points: Point[], smoothing: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const tangents: Vec[] = points.map((_, i) => {
    const prev = points[i - 1] ?? points[i];
    const next = points[i + 1] ?? points[i];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
  });

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
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

  return (
    <g>
      {network.lines.map((line) => {
        const points: Point[] = [];
        for (const id of line.stationIds) {
          const station: Station | undefined = stationsById.get(id);
          if (!station) continue;
          points.push({ x: station.x, y: station.y });
          const bends = line.bends?.[id];
          if (bends) points.push(...bends);
        }

        const d = buildSmoothPath(points, smoothing);

        return (
          <path
            key={line.id}
            d={d}
            fill="none"
            stroke={line.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}
