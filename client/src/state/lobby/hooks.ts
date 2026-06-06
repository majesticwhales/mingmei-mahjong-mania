import { useContext, useMemo } from "react";
import { LobbyContext } from "./Context";
import { useAuth } from "../auth/hooks";

export function useLobby() {
  const ctx = useContext(LobbyContext);
  if (!ctx) {
    throw new Error("useLobby must be used within LobbyProvider");
  }
  return ctx;
}

export function useIsHost() {
  const { state } = useLobby();
  const { state: authState } = useAuth();
  return useMemo(() => {
    if (state.status !== "ready" || authState.status !== "authenticated") return false;
    return state.lobby.hostUserId === authState.user.id;
  }, [state, authState]);
}

export function useLobbyMembers() {
  const { state } = useLobby();
  return useMemo(() => {
    if (state.status !== "ready") return [];
    return [...state.lobby.members];
  }, [state]);
}

export function useLobbyNotifications() {
  const { state } = useLobby();
  return useMemo(() => {
    if (state.status !== "ready") return [];
    return state.lobby.notifications;
  }, [state]);
}
