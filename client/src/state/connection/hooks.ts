import { useContext } from "react";
import { ConnectionContext } from "./Context";

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) {
    throw new Error("useConnection must be used within ConnectionProvider");
  }
  return ctx;
}

export function useIsOnline() {
  const { state } = useConnection();
  return state.status === "connected";
}
