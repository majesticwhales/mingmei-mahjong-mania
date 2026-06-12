import { describe, expect, it } from "vitest";
import { formatEventMessage, formatTeamLabel } from "./formatEventMessage";
import type { RecentEventDto } from "../wire/projection";

function event(overrides: Partial<RecentEventDto> & Pick<RecentEventDto, "type">): RecentEventDto {
  return {
    sequence: 1,
    teamCode: "east",
    at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatTeamLabel", () => {
  it("capitalizes team wind codes", () => {
    expect(formatTeamLabel("east")).toBe("Team East");
    expect(formatTeamLabel(null)).toBe("A team");
  });
});

describe("formatEventMessage", () => {
  it("formats check-in and check-out copy", () => {
    expect(
      formatEventMessage(
        event({ type: "CHECK_IN", nodeName: "Royal Ontario Museum" }),
      ),
    ).toBe("Team East checked in at Royal Ontario Museum");

    expect(
      formatEventMessage(
        event({ type: "CHECK_OUT", nodeName: "Royal Ontario Museum" }),
      ),
    ).toBe("Team East checked out from Royal Ontario Museum");
  });

  it("formats swap copy with tile names", () => {
    expect(
      formatEventMessage(
        event({
          type: "SWAP_TILE",
          nodeName: "Museum",
          handTileDisplayName: "5 Pin",
          stationTileDisplayName: "3 Sou",
        }),
      ),
    ).toBe("Team East swapped 5 Pin for 3 Sou at Museum");
  });

  it("falls back to station code lookup and title case", () => {
    expect(
      formatEventMessage(event({ type: "CHECK_IN", nodeCode: "museum" }), {
        stationNamesByCode: { museum: "Royal Ontario Museum" },
      }),
    ).toBe("Team East checked in at Royal Ontario Museum");

    expect(formatEventMessage(event({ type: "CHECK_IN", nodeCode: "bay_st" }))).toBe(
      "Team East checked in at Bay St",
    );
  });

  it("formats unlock events with formal phase and slot copy", () => {
    expect(
      formatEventMessage(
        event({
          type: "VISIBILITY_PHASE_ADVANCED",
          teamCode: null,
          phase: 1,
          visibilityPhaseCount: 3,
        }),
      ),
    ).toBe(
      "Phase 2 of 3 unlocked — additional station tiles are now visible",
    );

    expect(
      formatEventMessage(
        event({ type: "SLOT_UNLOCKED", teamCode: null, slotIndex: 1 }),
      ),
    ).toBe("Station slot 2 unlocked for tile claims");

    expect(
      formatEventMessage(
        event({ type: "SLOT_MAP_UNLOCKED", teamCode: null, slotIndex: 2 }),
      ),
    ).toBe("Station slot 3 revealed on the map");
  });
});
