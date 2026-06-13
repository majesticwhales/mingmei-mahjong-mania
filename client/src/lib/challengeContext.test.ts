import { describe, expect, it } from "vitest";
import type { AtStationDto } from "../wire/projection";
import { resolveCheckedInChallenge } from "./challengeContext";

// Phase L Chunk 4 B-2: `AtStationDto.tiles[]` is required. The
// challenge-context helper only reads `currentChallenge`, so an empty
// tiles array is fine here.
const baseAtStation: AtStationDto = {
  nodeId: "node-1",
  code: "BLY",
  tiles: [],
};

describe("resolveCheckedInChallenge", () => {
  it("returns the server-provided currentChallenge when present", () => {
    expect(
      resolveCheckedInChallenge({
        ...baseAtStation,
        currentChallenge: {
          challengeId: "c-1",
          title: "Real challenge",
          description: "From the server",
          flavorText: null,
          imageUrl: null,
          status: "available",
        },
      }),
    ).toEqual({
      challengeId: "c-1",
      title: "Real challenge",
      description: "From the server",
      flavorText: null,
      imageUrl: null,
      status: "available",
    });
  });

  it("returns null when atStation is null (team not checked in)", () => {
    expect(resolveCheckedInChallenge(null)).toBeNull();
  });

  it("returns null when atStation has no currentChallenge configured", () => {
    expect(resolveCheckedInChallenge(baseAtStation)).toBeNull();
  });

  it("synthesises status='available' when the projection's cooldown deadline has elapsed", () => {
    // Regression: the projection is rebuilt only on server events, but
    // cooldown expiry is a passive wall-clock transition with no
    // event. Without this synthesis the GameScreen auto-start effect
    // would skip on a stale `cooldown` snapshot and the modal would
    // open with `instanceId === undefined` + status="cooldown" →
    // Complete disabled until the next event came in.
    const now = new Date("2026-06-12T12:00:00.000Z");
    const elapsed = new Date(now.getTime() - 1_000).toISOString();
    expect(
      resolveCheckedInChallenge(
        {
          ...baseAtStation,
          currentChallenge: {
            challengeId: "c-1",
            title: "Real challenge",
            description: "From the server",
            flavorText: null,
            imageUrl: null,
            status: "cooldown",
            instanceId: "instance-prev",
            cooldownUntil: elapsed,
          },
        },
        now,
      ),
    ).toEqual({
      challengeId: "c-1",
      title: "Real challenge",
      description: "From the server",
      flavorText: null,
      imageUrl: null,
      status: "available",
      instanceId: undefined,
      cooldownUntil: undefined,
    });
  });

  it("preserves status='cooldown' when the deadline is still in the future", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const future = new Date(now.getTime() + 60_000).toISOString();
    expect(
      resolveCheckedInChallenge(
        {
          ...baseAtStation,
          currentChallenge: {
            challengeId: "c-1",
            title: "Real challenge",
            description: "From the server",
            flavorText: null,
            imageUrl: null,
            status: "cooldown",
            instanceId: "instance-prev",
            cooldownUntil: future,
          },
        },
        now,
      ),
    ).toEqual({
      challengeId: "c-1",
      title: "Real challenge",
      description: "From the server",
      flavorText: null,
      imageUrl: null,
      status: "cooldown",
      instanceId: "instance-prev",
      cooldownUntil: future,
    });
  });
});
