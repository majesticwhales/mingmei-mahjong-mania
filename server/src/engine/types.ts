/**
 * Command types accepted by the game engine. Each maps to a handler in the
 * command handler registry (see process-command.ts).
 *
 * `CHECK_IN` / `CHECK_OUT` / `SWAP_TILE` / `SWAP_LOCATION_TILES` match the
 * commands described in TDD §3.4. The three `*_CHALLENGE` commands wire
 * the honor-system challenge gate (TDD §3.8); they reuse the same command
 * name as their emitted event, matching `CHECK_IN` / `SWAP_TILE` style.
 */
export const COMMAND_TYPES = [
  "CHECK_IN",
  "CHECK_OUT",
  "SWAP_TILE",
  "SWAP_LOCATION_TILES",
  "START_CHALLENGE",
  "CHALLENGE_COMPLETED",
  "CHALLENGE_FORFEITED",
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export function isCommandType(value: unknown): value is CommandType {
  return (
    typeof value === "string" &&
    (COMMAND_TYPES as readonly string[]).includes(value)
  );
}

export const NOTIFICATION_TYPES = [
  "VISIBILITY_PHASE_ADVANCED",
  "GAME_ENDED",
  "NOTIFICATION",
  "SLOT_UNLOCKED",
] as const;


/**
 * Event types written to `game_events`. A superset of command types: handlers
 * may emit one or more events per command, and the scheduler emits
 * `VISIBILITY_PHASE_ADVANCED` / `GAME_ENDED` / `NOTIFICATION`.
 */
export const EVENT_TYPES = [
  ...COMMAND_TYPES,
  ...NOTIFICATION_TYPES,
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
