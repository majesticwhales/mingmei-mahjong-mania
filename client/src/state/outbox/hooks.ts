import { useContext, useMemo } from "react";
import { OutboxContext } from "./Context";

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) {
    throw new Error("useOutbox must be used within OutboxProvider");
  }
  return ctx;
}

export function useOutboxDepth() {
  const { state } = useOutbox();
  return useMemo(
    () =>
      Object.values(state.byGame)
        .flat()
        .filter((row) => row.status === "pending" || row.status === "in_flight").length,
    [state.byGame],
  );
}

export function useOutboxStatus(clientCommandId: string | null) {
  const { state } = useOutbox();
  return useMemo(() => {
    if (!clientCommandId) return null;
    for (const rows of Object.values(state.byGame)) {
      const row = rows.find((item) => item.clientCommandId === clientCommandId);
      if (row) return row;
    }
    return null;
  }, [state.byGame, clientCommandId]);
}
