import type { AuthAction, AuthState } from "./types";

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "auth/restore":
      return state.status === "authenticated" && state.token === action.token
        ? state
        : { status: "unknown" };
    case "auth/login/success":
      return {
        status: "authenticated",
        user: action.user,
        token: action.token,
        activeGameId: action.activeGameId,
      };
    case "auth/logout":
    case "auth/restore/failed":
      return { status: "anonymous" };
    default:
      return state;
  }
}
