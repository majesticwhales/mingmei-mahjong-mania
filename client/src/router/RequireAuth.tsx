import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/auth/hooks";

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "unknown") {
    return (
      <main className="screen screen--loading">
        <p>Loading…</p>
      </main>
    );
  }

  if (state.status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
