import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth/hooks";

export function RootRedirect() {
  const { state } = useAuth();

  if (state.status === "unknown") {
    return (
      <main className="screen screen--loading">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <Navigate to={state.status === "authenticated" ? "/lobbies" : "/login"} replace />
  );
}
