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
});
