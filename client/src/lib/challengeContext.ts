import type { AtStationChallengeDto, AtStationDto } from "../wire/projection";

/**
 * Return the team's current challenge at their checked-in station, or
 * `null` when they aren't checked in / no challenge is configured.
 *
 * Phase H (scaffold removed): every tile station now carries a real
 * server-side challenge — see `server/seeders/data/challenges/ttc-2026.json`
 * — so this helper is mostly a thin getter over
 * `atStation.currentChallenge`.
 *
 * **Cooldown synthesis.** The projection's `currentChallenge.status` is
 * a snapshot taken at the last `game.state` rebuild (i.e. the last
 * server event). Cooldown expiry is a pure wall-clock transition with
 * no server event, so a projection captured during cooldown stays at
 * `status: "cooldown"` indefinitely after the deadline passes. When we
 * detect that situation here we surface the effective `available`
 * state so downstream consumers (the auto-start `START_CHALLENGE`
 * effect, the modal's `completeDisabled` gate) don't have to reason
 * about staleness. `instanceId` and `cooldownUntil` belong to the
 * now-resolved prior attempt and are stripped — a fresh
 * `START_CHALLENGE` will mint a new instance once it fires.
 *
 * The `now` parameter is for tests; production callers use the default.
 */
export function resolveCheckedInChallenge(
  atStation: AtStationDto | null,
  now: Date = new Date(),
): AtStationChallengeDto | null {
  const challenge = atStation?.currentChallenge ?? null;
  if (!challenge) return null;
  if (
    challenge.status === "cooldown"
    && challenge.cooldownUntil != null
    && new Date(challenge.cooldownUntil).getTime() <= now.getTime()
  ) {
    return {
      ...challenge,
      status: "available",
      instanceId: undefined,
      cooldownUntil: undefined,
    };
  }
  return challenge;
}
