import type { SubwayLine } from "../data/types";

interface Props {
  lines: SubwayLine[];
}

export function Legend({ lines }: Props) {
  return (
    <div className="legend" aria-label="Line legend">
      {lines.map((line) => (
        <div key={line.id} className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: line.color }}
            aria-hidden="true"
          />
          <span className="legend__name">{line.name}</span>
        </div>
      ))}
    </div>
  );
}
