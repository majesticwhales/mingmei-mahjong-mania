import { useCallback, useContext, useMemo } from "react";
import { captureGeolocationForCommand } from "../../hooks/useGeolocation";
import type { CommandType } from "../../wire/command";
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
 * Phase L — wrap `submitCommand` so every call attempts a geolocation
 * capture and attaches the result to the payload before enqueueing.
 *
 * Behaviour contract (matches TDD §3.12):
 *   - The hook tries `captureGeolocationForCommand()` (2-second timeout,
 *     low-accuracy, 60-second cached fix reuse) before each submission.
 *   - On success, the resulting `{ latitude, longitude, accuracy, capturedAt }`
 *     block is shallow-merged onto the payload under the `geo` key. We
 *     never overwrite an explicit `geo` already on the payload — the
 *     caller wins, since they presumably had a reason to bypass the
 *     capture path (e.g. tests, or replay scenarios).
 *   - On failure (permission denied, no `navigator.geolocation`, timeout)
 *     the capture returns `null`; the hook still submits the command
 *     with no `geo` key. The server's `recordCommandGeolocation` treats
 *     a missing block and a malformed block the same way (warn+allow,
 *     last_known_* untouched) so the command never blocks on geo.
 *   - The hook never throws on capture failures — only the underlying
 *     `submitCommand` (i.e. the outbox enqueue) can reject.
 *
 * Returns a stable `(payload) => Promise<clientCommandId>` callback.
 *
 * Bind one hook per command type at the component level — re-binding
 * within an event handler would force the wrapping `useCallback` to
 * re-create every render and defeat downstream memoisation.
 */
export function useCommandWithGeo(commandType: CommandType | string) {
  const { submitCommand } = useGame();
  return useCallback(
    async (payload: Record<string, unknown> = {}) => {
      const geo = await captureGeolocationForCommand();
      const merged: Record<string, unknown> =
        geo != null && payload.geo == null
          ? { ...payload, geo }
          : payload;
      return submitCommand(commandType, merged);
    },
    [submitCommand, commandType],
  );
}

/**
 * Phase J — submit a `CLAIM_WIN` command for the given station tile.
 *
 * Phase L: now routes through `useCommandWithGeo` so the
 * `recordCommandGeolocation` server-side helper has telemetry to write
 * to `last_known_*` and lift onto the event log. Behaviour is unchanged
 * for callers — the `stationTileId` payload shape is identical.
 */
export function useClaimWin() {
  const submitClaim = useCommandWithGeo("CLAIM_WIN");
  return useCallback(
    (stationTileId: string) => submitClaim({ stationTileId }),
    [submitClaim],
  );
}
