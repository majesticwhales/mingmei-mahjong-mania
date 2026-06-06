import { useEffect } from "react";
import { useConnection } from "../state/connection/hooks";
import { useOutbox } from "../state/outbox/hooks";

export function ToastShelf() {
  const { state: connState } = useConnection();
  const { state, dismissToast } = useOutbox();

  useEffect(() => {
    for (const toast of state.toasts) {
      const timer = setTimeout(() => dismissToast(toast.id), 3000);
      return () => clearTimeout(timer);
    }
  }, [state.toasts, dismissToast]);

  const banner =
    connState.status === "disconnected" ||
    connState.status === "reconnecting" ||
    connState.status === "giving_up"
      ? connState.status === "giving_up"
        ? "Connection lost. Tap the badge to retry."
        : "Reconnecting…"
      : state.conflictBanner
        ? `Command conflict (${state.conflictBanner.clientCommandId}). Please reload.`
        : null;

  return (
    <>
      {banner && <div className="banner">{banner}</div>}
      <div className="toast-shelf" aria-live="polite">
        {state.toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
