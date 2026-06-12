import type { VisibilityMode } from "./visibility-mode.ts";

const ONE_HOUR_SECONDS = 60 * 60;
const THIRTY_MINUTES_SECONDS = 30 * 60;
const FIVE_MINUTES_SECONDS = 5 * 60;

export const PRODUCTION_GAME_DURATION_SECONDS = 4 * ONE_HOUR_SECONDS;
export const TEST_GAME_DURATION_SECONDS = 240;

/** Per-(team, challenge) cooldown after a completion / forfeit (TDD §3.8). */
export const PRODUCTION_CHALLENGE_COOLDOWN_SECONDS = 5 * 60;
/** Short cooldown for admin testing so the swap-credit loop is exercisable in ~minutes. */
export const TEST_CHALLENGE_COOLDOWN_SECONDS = 5;

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
  /**
   * Per-(team, challenge) cooldown applied after a challenge resolves
   * (completion or forfeit). Snapshotted to `lobbies.challenge_cooldown_seconds`
   * on create and onto `games.challenge_cooldown_seconds` at start; the
   * engine reads from the game row. See TDD §3.8.
   */
  challengeCooldownSeconds: number;
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
  challengeCooldownSeconds: PRODUCTION_CHALLENGE_COOLDOWN_SECONDS,
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
  challengeCooldownSeconds: TEST_CHALLENGE_COOLDOWN_SECONDS,
  notifications: timeRemainingNotifications(TEST_GAME_DURATION_SECONDS, [
    { secondsBeforeEnd: 60, minutesLeft: 1 },
    { secondsBeforeEnd: 30, minutesLeft: 0 },
    { secondsBeforeEnd: 5, minutesLeft: 0 },
  ]),
};

export function lobbyPresetForTestFlag(isTestGame: boolean): LobbyGamePreset {
  return isTestGame ? TEST_LOBBY_PRESET : PRODUCTION_LOBBY_PRESET;
}

/**
 * Evenly space slot unlocks across the game duration (slot 0 is always
 * 0). Used only by the **dormant** `ConfigForm` / `slotTier.ts` paths
 * (client TDD §5.3 / §11) and the seeder's `map_templates.default_*`
 * columns. Live lobby creation goes through [`deriveTierOffsets`](#)
 * below — see TDD §3.3 + §4.5.
 */
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

export interface TierOffsets {
  /** `slot_unlock_offsets_seconds` — when each slot becomes claimable. */
  slotUnlockOffsetsSeconds: number[];
  /** `slot_map_unlock_offsets_seconds` — when each slot reveals on the map. */
  slotMapUnlockOffsetsSeconds: number[];
}

/**
 * Build the per-tier claim + map offsets that match the spec from TDD
 * §3.3 (cross-linked from §6.3's "at-station privilege"):
 *
 * | slot | claim   | map   |
 * |------|---------|-------|
 * | 0    | 0       | 0     | Tier 1 — visible + claimable from t=0.
 * | 1    | 0       | P     | Tier 2 — claimable from t=0 (station-only,
 * |      |         |       | via the at-station privilege), revealed on
 * |      |         |       | the map at t=P.
 * | k≥2  | (k-1)·P | k·P   | Tier 3+ — claimable at t=(k-1)·P, revealed
 * |      |         |       | on the map one phase later.
 *
 * `P` = `phaseIntervalSeconds`. This formula keeps the test and
 * production presets behaviourally identical — only the absolute clock
 * differs (production: P=3600s; test: P=60s). The map timeline
 * `[0, P, 2P, …]` matches the phase-driven map-reveal schedule under
 * `phaseCount === slotsPerNode` (TDD §3.13), so the scheduler-driven
 * `SLOT_MAP_UNLOCKED` events line up with `VISIBILITY_PHASE_ADVANCE`.
 *
 * @param slotsPerNode Number of slots per node (>= 1).
 * @param phaseIntervalSeconds Phase interval `P` in seconds. When `<=0`
 *   every slot collapses to `claim=0, map=0`.
 */
export function deriveTierOffsets(
  slotsPerNode: number,
  phaseIntervalSeconds: number,
): TierOffsets {
  const claim: number[] = [];
  const map: number[] = [];
  const P =
    Number.isFinite(phaseIntervalSeconds) && phaseIntervalSeconds > 0
      ? Math.round(phaseIntervalSeconds)
      : 0;
  for (let k = 0; k < slotsPerNode; k += 1) {
    claim.push(k <= 1 ? 0 : (k - 1) * P);
    map.push(k * P);
  }
  return {
    slotUnlockOffsetsSeconds: claim,
    slotMapUnlockOffsetsSeconds: map,
  };
}
