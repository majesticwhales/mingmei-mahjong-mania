import { useConnection } from "../state/connection/hooks";
import { useOutboxDepth } from "../state/outbox/hooks";

export function ConnectionBadge() {
  const { state, retry } = useConnection();
  const pendingCount = useOutboxDepth();

  const dotClass =
    state.status === "connected"
      ? "connection-badge__dot--connected"
      : state.status === "reconnecting" || state.status === "connecting"
        ? "connection-badge__dot--reconnecting"
        : "connection-badge__dot--disconnected";

  const label =
    state.status === "connected"
      ? "Connected"
      : state.status === "reconnecting" || state.status === "connecting"
        ? "Reconnecting"
        : state.status === "giving_up"
          ? "Offline"
          : "Disconnected";

  const clickable = state.status === "giving_up" || state.status === "disconnected";

  return (
    <button
      type="button"
      className={`connection-badge${clickable ? " connection-badge--clickable" : ""}`}
      aria-label={label}
      onClick={clickable ? retry : undefined}
      disabled={!clickable}
    >
      <span className={`connection-badge__dot ${dotClass}`} aria-hidden="true" />
      <span>{label}</span>
      {pendingCount > 0 && (
        <span className="connection-badge__pill" aria-label={`${pendingCount} pending commands`}>
          {pendingCount}
        </span>
      )}
    </button>
  );
}
