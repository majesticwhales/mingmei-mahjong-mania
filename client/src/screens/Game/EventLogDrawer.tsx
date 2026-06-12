import { formatEventMessage } from "../../lib/formatEventMessage";
import type { RecentEventDto } from "../../wire/projection";

interface Props {
  events: RecentEventDto[];
  stationNamesByCode?: Readonly<Record<string, string>>;
  open: boolean;
  onClose: () => void;
  /** Events with sequence greater than this were unseen when the drawer opened. */
  unseenBoundarySequence?: number | null;
}

function oldEventsStartIndex(
  sortedEvents: RecentEventDto[],
  unseenBoundarySequence: number | null | undefined,
) {
  if (unseenBoundarySequence == null) return -1;
  return sortedEvents.findIndex(
    (event, index) =>
      event.sequence <= unseenBoundarySequence &&
      sortedEvents.slice(0, index).some((item) => item.sequence > unseenBoundarySequence),
  );
}

export function EventLogDrawer({
  events,
  stationNamesByCode,
  open,
  onClose,
  unseenBoundarySequence = null,
}: Props) {
  const sortedEvents = [...events].sort((a, b) => b.sequence - a.sequence);
  const dividerIndex = oldEventsStartIndex(sortedEvents, unseenBoundarySequence);

  return (
    <div className={`event-log${open ? " event-log--open" : ""}`} aria-hidden={!open}>
      <header className="event-log__header">
        <h2>Event log</h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <ol className="event-log__list">
        {sortedEvents.map((event, index) => (
          <li key={event.sequence}>
            {index === dividerIndex && (
              <hr className="event-log__new-divider" aria-hidden="true" />
            )}
            <time>{new Date(event.at).toLocaleTimeString()}</time>
            <span>{formatEventMessage(event, { stationNamesByCode })}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
