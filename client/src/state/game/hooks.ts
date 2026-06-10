import { useCallback, useContext, useMemo } from "react";
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

/**
 * Phase J — convenience for the requesting team's hand-completed
 * snapshot. `null` until the team has successfully `CLAIM_WIN`-ed; from
 * then on, every projection refresh carries the same snapshot until
 * the game ends. Other teams' projections never expose this field, so
 * the selector mirrors the server-side per-team scope.
 */
export function useHandCompleted() {
  const projection = useGameProjection();
  return projection?.handCompleted ?? null;
}

/**
 * Phase J — public completion-order roster across every team in the
 * game. Empty until the first `CLAIM_WIN`; on game end every completed
 * team is listed (incomplete teams are excluded — they never get a
 * `completedAt`). Drives the "X / N teams complete" badge.
 */
export function useTeamsCompleted() {
  const projection = useGameProjection();
  return useMemo(() => projection?.teamsCompleted ?? [], [projection]);
}

/**
 * Phase J — submit a `CLAIM_WIN` command for the given station tile.
 * Thin wrapper over the generic `submitCommand`; isolates the payload
 * shape so callers (ClaimWinModal, integration tests, future Discord
 * commands) don't repeat the `{ stationTileId }` literal.
 */
export function useClaimWin() {
  const { submitCommand } = useGame();
  return useCallback(
    (stationTileId: string) => submitCommand("CLAIM_WIN", { stationTileId }),
    [submitCommand],
  );
}
