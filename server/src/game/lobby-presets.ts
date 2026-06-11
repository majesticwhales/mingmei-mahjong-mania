import type { VisibilityMode } from "./visibility-mode.ts";

const ONE_HOUR_SECONDS = 60 * 60;
const THIRTY_MINUTES_SECONDS = 30 * 60;
const FIVE_MINUTES_SECONDS = 5 * 60;

export const PRODUCTION_GAME_DURATION_SECONDS = 4 * ONE_HOUR_SECONDS;
export const TEST_GAME_DURATION_SECONDS = 240;

export interface LobbyPresetNotification {
  atSeconds: number;
  template: string;
  data: Record<string, unknown> | null;
}

export interface LobbyGamePreset {
  gameDurationSeconds: number;
  visibilityPhaseIntervalSeconds: number;
  visibilityPhaseCount: number;
  visibilityMode: VisibilityMode;
  notifications: LobbyPresetNotification[];
}

function timeRemainingNotifications(
  durationSeconds: number,
  warnings: Array<{ secondsBeforeEnd: number; minutesLeft: number }>,
): LobbyPresetNotification[] {
  return warnings.map(({ secondsBeforeEnd, minutesLeft }) => ({
    atSeconds: durationSeconds - secondsBeforeEnd,
    template: "time_warning",
    data: { minutesLeft },
  }));
}

/** Fixed TTC 2026 production game: 4 hours, phases every hour, standard time warnings. */
export const PRODUCTION_LOBBY_PRESET: LobbyGamePreset = {
  gameDurationSeconds: PRODUCTION_GAME_DURATION_SECONDS,
  visibilityPhaseIntervalSeconds: ONE_HOUR_SECONDS,
  visibilityPhaseCount: 3,
  visibilityMode: "both",
  notifications: timeRemainingNotifications(PRODUCTION_GAME_DURATION_SECONDS, [
    { secondsBeforeEnd: ONE_HOUR_SECONDS, minutesLeft: 60 },
    { secondsBeforeEnd: THIRTY_MINUTES_SECONDS, minutesLeft: 30 },
    { secondsBeforeEnd: FIVE_MINUTES_SECONDS, minutesLeft: 5 },
  ]),
};

/** Short game for admin testing: 4 minutes scaled to 240 seconds. */
export const TEST_LOBBY_PRESET: LobbyGamePreset = {
  gameDurationSeconds: TEST_GAME_DURATION_SECONDS,
  visibilityPhaseIntervalSeconds: 60,
  visibilityPhaseCount: 3,
  visibilityMode: "both",
  notifications: timeRemainingNotifications(TEST_GAME_DURATION_SECONDS, [
    { secondsBeforeEnd: 60, minutesLeft: 1 },
    { secondsBeforeEnd: 30, minutesLeft: 0 },
    { secondsBeforeEnd: 5, minutesLeft: 0 },
  ]),
};

export function lobbyPresetForTestFlag(isTestGame: boolean): LobbyGamePreset {
  return isTestGame ? TEST_LOBBY_PRESET : PRODUCTION_LOBBY_PRESET;
}

/** Evenly space slot unlocks across the game duration (slot 0 is always 0). */
export function deriveAutoDistributedOffsets(
  slotsPerNode: number,
  gameDurationSeconds: number,
): number[] {
  const out: number[] = [];
  const duration =
    Number.isFinite(gameDurationSeconds) && gameDurationSeconds > 0
      ? gameDurationSeconds
      : 0;
  for (let k = 0; k < slotsPerNode; k += 1) {
    out.push(Math.round((duration * k) / slotsPerNode));
  }
  return out;
}
