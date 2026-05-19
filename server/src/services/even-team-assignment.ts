/** Game team indices (map to team_definitions at game start). */
export const GAME_TEAM_SLOTS = [1, 2, 3, 4] as const;

export type GameTeamSlot = (typeof GAME_TEAM_SLOTS)[number];

export function emptyTeamCounts(): Record<string, number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0 };
}

export function countsFromSlots(
  slots: Iterable<number | null | undefined>,
): Record<string, number> {
  const counts = emptyTeamCounts();
  for (const slot of slots) {
    if (slot != null && slot >= 1 && slot <= 4) {
      counts[String(slot)] += 1;
    }
  }
  return counts;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/**
 * Assign each user to a team 1–4 so counts stay as balanced as possible.
 * Uses existing per-team counts as a starting point (for mixed mode).
 */
export function assignTeamsEvenly(
  userIds: string[],
  existingCounts: Record<string, number> = emptyTeamCounts(),
): Map<string, GameTeamSlot> {
  const counts = new Map<GameTeamSlot, number>(
    GAME_TEAM_SLOTS.map((team) => [team, existingCounts[String(team)] ?? 0]),
  );
  const result = new Map<string, GameTeamSlot>();
  const shuffled = [...userIds];
  shuffleInPlace(shuffled);

  for (const userId of shuffled) {
    let minCount = Infinity;
    for (const team of GAME_TEAM_SLOTS) {
      minCount = Math.min(minCount, counts.get(team)!);
    }
    const candidates = GAME_TEAM_SLOTS.filter(
      (team) => counts.get(team) === minCount,
    );
    const pick =
      candidates[Math.floor(Math.random() * candidates.length)] ?? 1;
    counts.set(pick, counts.get(pick)! + 1);
    result.set(userId, pick);
  }

  return result;
}

/** True if unassigned players can fill every team that has zero members. */
export function canStaffMissingTeamsWithPool(
  playersPerTeam: Record<string, number>,
  unassignedCount: number,
): { ok: boolean; missingTeams: number[] } {
  const missingTeams = GAME_TEAM_SLOTS.filter(
    (team) => playersPerTeam[String(team)] === 0,
  );
  if (missingTeams.length === 0) {
    return { ok: true, missingTeams: [] };
  }
  if (unassignedCount < missingTeams.length) {
    return { ok: false, missingTeams: [...missingTeams] };
  }
  return { ok: true, missingTeams: [] };
}

export interface TeamAssignmentInput {
  userId: string;
  teamSlot: number | null;
}

/**
 * Final team per user at game start (persists picks; fills random pool evenly).
 */
export function resolveTeamsForGameStart(
  mode: "pick" | "random" | "mixed",
  assignments: TeamAssignmentInput[],
): Map<string, GameTeamSlot> {
  const picked = new Map<string, GameTeamSlot>();
  const pool: string[] = [];

  for (const { userId, teamSlot } of assignments) {
    if (teamSlot != null && teamSlot >= 1 && teamSlot <= 4) {
      picked.set(userId, teamSlot as GameTeamSlot);
    } else {
      pool.push(userId);
    }
  }

  if (mode === "random") {
    return assignTeamsEvenly(assignments.map((a) => a.userId));
  }

  if (mode === "pick") {
    if (pool.length > 0) {
      throw new Error("pick mode: all members must choose a team before start");
    }
    return picked;
  }

  // mixed: keep picks, distribute pool evenly on top of current counts
  const evenForPool = assignTeamsEvenly(pool, countsFromSlots(picked.values()));
  return new Map([...picked, ...evenForPool]);
}
