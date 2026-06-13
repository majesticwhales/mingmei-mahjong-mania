/**
 * `GAME_ENDED` reason values, shared across the surfaces that surface
 * the reason back to the client:
 *
 *   - `game.state` projection (`GameStateProjection.endReason`,
 *     populated whenever `games.status` is `ending` or `ended` so the
 *     wrap-up screen can render reason-specific copy without waiting
 *     for the summary endpoint).
 *   - `GET /games/:id/summary` DTO (`GameSummaryDto.endReason`).
 *
 * Both surfaces decode the same `GAME_ENDED` event payload (canonical
 * source — see `scheduler/handlers/game-end.ts`). The shared type +
 * validator keeps the two paths in lockstep so any drift between
 * wrap-up copy and summary copy is impossible.
 */

export type GameEndReason = "timer" | "all_teams_completed" | "manual";

export function isValidGameEndReason(value: unknown): value is GameEndReason {
  return (
    value === "timer" ||
    value === "all_teams_completed" ||
    value === "manual"
  );
}
