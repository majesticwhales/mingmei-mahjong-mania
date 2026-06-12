import { describe, expect, it } from "vitest";
import type { AtStationDto } from "../wire/projection";
import {
  buildScaffoldChallenge,
  isChallengeOnCooldown,
  needsChallengeBeforeSwap,
  resolveCheckedInChallenge,
  SCAFFOLD_CHALLENGE_ID,
} from "./challengeContext";

// Phase L Chunk 4 B-2: `AtStationDto.tiles[]` is required. The
// challenge-context helpers only read `currentChallenge` /
// `pendingSwapCredit`, so an empty tiles array is fine here.
const baseAtStation: AtStationDto = {
  nodeId: "node-1",
  code: "BLY",
  tiles: [],
};

describe("resolveCheckedInChallenge", () => {
  it("returns the server challenge when present", () => {
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
            status: "available",
          },
        },
        "Bloor-Yonge",
        false,
      ),
    ).toEqual({
      challengeId: "c-1",
      title: "Real challenge",
      description: "From the server",
      flavorText: null,
      imageUrl: null,
      status: "available",
      isScaffold: false,
    });
  });

  it("returns a scaffold challenge when checked in without server data", () => {
    const challenge = resolveCheckedInChallenge(baseAtStation, "Bloor-Yonge", false);

    expect(challenge?.challengeId).toBe(SCAFFOLD_CHALLENGE_ID);
    expect(challenge?.title).toBe("Explore Bloor-Yonge");
    expect(challenge?.isScaffold).toBe(true);
  });

  it("returns null for scaffold once locally completed", () => {
    expect(resolveCheckedInChallenge(baseAtStation, "Bloor-Yonge", true)).toBeNull();
  });
});

describe("needsChallengeBeforeSwap", () => {
  it("gates swap for checked-in stations without server challenges until scaffold completes", () => {
    expect(needsChallengeBeforeSwap(baseAtStation, false)).toBe(true);
    expect(needsChallengeBeforeSwap(baseAtStation, true)).toBe(false);
  });

  it("returns false when no challenge is configured and scaffold is complete", () => {
    expect(needsChallengeBeforeSwap(null, false)).toBe(false);
  });

  it("returns false when the team already holds a swap credit", () => {
    expect(
      needsChallengeBeforeSwap({
        ...baseAtStation,
        currentChallenge: {
          challengeId: "c-1",
          title: "Test",
          description: null,
          flavorText: null,
          imageUrl: null,
          status: "in_progress",
          instanceId: "i-1",
        },
        pendingSwapCredit: true,
      }),
    ).toBe(false);
  });

  it("returns false during cooldown", () => {
    expect(
      needsChallengeBeforeSwap({
        ...baseAtStation,
        currentChallenge: {
          challengeId: "c-1",
          title: "Test",
          description: null,
          flavorText: null,
          imageUrl: null,
          status: "cooldown",
          cooldownUntil: "2026-06-11T12:00:00.000Z",
        },
      }),
    ).toBe(false);
  });
});

describe("buildScaffoldChallenge", () => {
  it("uses the station name in the title", () => {
    expect(buildScaffoldChallenge("Union Station").title).toBe("Explore Union Station");
  });
});

describe("isChallengeOnCooldown", () => {
  it("detects cooldown status", () => {
    expect(
      isChallengeOnCooldown({
        ...baseAtStation,
        currentChallenge: {
          challengeId: "c-1",
          title: "Test",
          description: null,
          flavorText: null,
          imageUrl: null,
          status: "cooldown",
        },
      }),
    ).toBe(true);

    expect(isChallengeOnCooldown(baseAtStation)).toBe(false);
  });
});
