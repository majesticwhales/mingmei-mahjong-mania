import { useContext, useMemo } from "react";
import { GameContext } from "./Context";

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error("useGame must be used within GameProvider");
  }
  return ctx;
}

export function useGameProjection() {
  const { state } = useGame();
  return useMemo(() => (state.status === "active" ? state.projection : null), [state]);
}

export function useGameTeamId() {
  const { state } = useGame();
  return useMemo(() => (state.status === "active" ? state.gameTeamId : null), [state]);
}

export function useEventLog() {
  const { state } = useGame();
  return useMemo(() => (state.status === "active" ? state.eventLog : []), [state]);
}

export function useAtStation() {
  const projection = useGameProjection();
  return projection?.atStation ?? null;
}

export function useNextVisibilityChange() {
  const projection = useGameProjection();
  return projection?.nextVisibilityChangeAt ?? null;
}
