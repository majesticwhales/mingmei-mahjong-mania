import type { AtStationChallengeDto, AtStationDto } from "../wire/projection";

/**
 * Return the team's current challenge at their checked-in station, or
 * `null` when they aren't checked in / no challenge is configured.
 *
 * Phase H (scaffold removed): every tile station now carries a real
 * server-side challenge — see `server/seeders/data/challenges/ttc-2026.json`
 * — so this helper is a thin getter over `atStation.currentChallenge`.
 */
export function resolveCheckedInChallenge(
  atStation: AtStationDto | null,
): AtStationChallengeDto | null {
  return atStation?.currentChallenge ?? null;
}
