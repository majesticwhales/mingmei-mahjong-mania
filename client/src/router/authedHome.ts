import type { AuthState } from "../state/auth/types";

export function authedHomePath(state: AuthState): string {
  if (state.status !== "authenticated") return "/login";
  return state.activeGameId ? `/games/${state.activeGameId}` : "/lobbies";
}
