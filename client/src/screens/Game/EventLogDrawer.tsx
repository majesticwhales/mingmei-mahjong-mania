import type { RecentEventDto } from "../../wire/projection";

interface Props {
  events: RecentEventDto[];
  open: boolean;
  onClose: () => void;
}

function formatEvent(event: RecentEventDto) {
  const parts = [event.type];
  if (event.teamCode) parts.push(`team ${event.teamCode}`);
  if (event.nodeCode) parts.push(`@ ${event.nodeCode}`);
  if (event.template) parts.push(event.template);
  return parts.join(" ");
}

export function EventLogDrawer({ events, open, onClose }: Props) {
  return (
    <div className={`event-log${open ? " event-log--open" : ""}`} aria-hidden={!open}>
      <header className="event-log__header">
        <h2>Event log</h2>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </header>
      <ol className="event-log__list">
        {[...events]
          .sort((a, b) => b.sequence - a.sequence)
          .map((event) => (
            <li key={event.sequence}>
              <time>{new Date(event.at).toLocaleTimeString()}</time>
              <span>{formatEvent(event)}</span>
            </li>
          ))}
      </ol>
    </div>
  );
}
