import type { AtStationChallengeDto, AtStationDto } from "../wire/projection";

export const SCAFFOLD_CHALLENGE_ID = "scaffold";

export interface ResolvedChallenge extends AtStationChallengeDto {
  /** True when using placeholder content until the backend sends a real challenge. */
  isScaffold: boolean;
}

export function buildScaffoldChallenge(stationName: string): ResolvedChallenge {
  return {
    challengeId: SCAFFOLD_CHALLENGE_ID,
    title: `Explore ${stationName}`,
    description:
      "Complete this challenge to unlock tile swapping at this station. Challenge details will come from the server soon.",
    flavorText: null,
    imageUrl: null,
    status: "in_progress",
    instanceId: SCAFFOLD_CHALLENGE_ID,
    isScaffold: true,
  };
}

/**
 * Resolve the challenge to show while checked in. Prefers the server-provided
 * `currentChallenge`; falls back to a client scaffold when the backend has
 * not yet attached challenges to the station.
 */
export function resolveCheckedInChallenge(
  atStation: AtStationDto | null,
  stationName: string | null,
  scaffoldComplete: boolean,
): ResolvedChallenge | null {
  if (!atStation) return null;

  if (atStation.currentChallenge) {
    return { ...atStation.currentChallenge, isScaffold: false };
  }

  if (scaffoldComplete) return null;

  return buildScaffoldChallenge(stationName ?? atStation.code);
}

/**
 * Phase H — a station with configured challenges gates `SWAP_TILE` until
 * the team earns a swap credit via `CHALLENGE_COMPLETED`. While the backend
 * is still wiring challenges, a client-side scaffold gates swap for every
 * check-in until the player completes the placeholder challenge.
 */
export function needsChallengeBeforeSwap(
  atStation: AtStationDto | null,
  scaffoldComplete = false,
): boolean {
  if (!atStation) return false;
  if (atStation.pendingSwapCredit) return false;

  if (atStation.currentChallenge) {
    return atStation.currentChallenge.status !== "cooldown";
  }

  return !scaffoldComplete;
}

export function isChallengeOnCooldown(atStation: AtStationDto | null): boolean {
  return atStation?.currentChallenge?.status === "cooldown";
}

export function isScaffoldChallenge(challenge: ResolvedChallenge | null): boolean {
  return challenge?.isScaffold === true;
}
