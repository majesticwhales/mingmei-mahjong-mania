import { useConnection } from "../state/connection/hooks";

export function RetryBanner() {
  const { state, retry } = useConnection();
  if (state.status !== "giving_up") return null;
  return (
    <div className="banner banner--danger">
      Could not reconnect.
      <button type="button" className="btn btn--ghost" onClick={retry}>
        Retry now
      </button>
    </div>
  );
}
