import type { Network, Station } from "../data/types";

interface Props {
  network: Network;
  station: Station | null;
  onClose: () => void;
}

export function StationPanel({ network, station, onClose }: Props) {
  const isOpen = Boolean(station);
  const linesById = new Map(network.lines.map((l) => [l.id, l]));

  return (
    <aside
      className={`station-panel${isOpen ? " station-panel--open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Station details"
    >
      <div className="station-panel__handle" aria-hidden="true" />

      <header className="station-panel__header">
        <div>
          <p className="station-panel__eyebrow">Station</p>
          <h2 className="station-panel__title">
            {station ? station.name : "Pick a station"}
          </h2>
        </div>
        <button
          type="button"
          className="station-panel__close"
          aria-label="Close station details"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {!station && (
        <p className="station-panel__empty">
          Tap any station on the map to see details. Pan with one finger, pinch to
          zoom, double-tap to zoom in.
        </p>
      )}

      {station && (
        <div className="station-panel__body">
          <section>
            <h3 className="station-panel__section-title">Served by</h3>
            <ul className="station-panel__lines">
              {station.lineIds
                .map((id) => linesById.get(id))
                .filter((l): l is NonNullable<typeof l> => Boolean(l))
                .map((line) => (
                  <li key={line.id} className="station-panel__line">
                    <span
                      className="station-panel__swatch"
                      style={{ background: line.color }}
                      aria-hidden="true"
                    />
                    <span>{line.name}</span>
                  </li>
                ))}
            </ul>
          </section>

          <section>
            <h3 className="station-panel__section-title">Details</h3>
            <dl className="station-panel__details">
              <div>
                <dt>Type</dt>
                <dd>{station.isInterchange ? "Interchange" : "Standard station"}</dd>
              </div>
              <div>
                <dt>Accessible</dt>
                <dd>
                  {station.accessible === undefined
                    ? "Unknown"
                    : station.accessible
                      ? "Yes"
                      : "No"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </aside>
  );
}
