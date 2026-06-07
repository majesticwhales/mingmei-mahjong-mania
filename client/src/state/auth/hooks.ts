import { useContext } from "react";
import { AuthContext } from "./Context";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useAuthToken() {
  const { state } = useAuth();
  return state.status === "authenticated" ? state.token : null;
}

export function useRequireAuth() {
  const { state } = useAuth();
  if (state.status !== "authenticated") {
    throw new Error("auth_required");
  }
  return state;
}
