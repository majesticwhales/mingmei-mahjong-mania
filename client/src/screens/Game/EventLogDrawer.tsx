import type { RecentEventDto } from "../../wire/projection";

interface Props {
  events: RecentEventDto[];
  open: boolean;
  onClose: () => void;
  /** Events with sequence greater than this were unseen when the drawer opened. */
  unseenBoundarySequence?: number | null;
}

function formatEvent(event: RecentEventDto) {
  const parts = [event.type];
  if (event.teamCode) parts.push(`team ${event.teamCode}`);
  if (event.nodeCode) parts.push(`@ ${event.nodeCode}`);
  if (event.template) parts.push(event.template);
  return parts.join(" ");
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
            <span>{formatEvent(event)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
