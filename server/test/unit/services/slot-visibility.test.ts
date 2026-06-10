import { describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import {
  assertSlotUnlocked,
  isSlotMapVisible,
  isSlotUnlocked,
  mapVisibleSlotIndices,
  phaseDrivenMapVisibleSlotIndices,
  slotUnlockAtMs,
  unlockedSlotIndices,
} from "../../../src/services/slot-visibility.ts";

const T0 = new Date("2026-05-30T16:00:00.000Z");
const T0_MS = T0.getTime();

const game = (offsets: number[]) => ({
  id: "game-1",
  startedAt: T0,
  slotUnlockOffsetsSeconds: offsets,
});

describe("slot-visibility", () => {
  describe("slotUnlockAtMs", () => {
    it("returns startedAt for slot 0 (always unlocked)", () => {
      expect(slotUnlockAtMs(game([0, 60, 600]), 0)).toBe(T0_MS);
    });

    it("returns startedAt + offset*1000 for non-zero slots", () => {
      expect(slotUnlockAtMs(game([0, 60, 600]), 1)).toBe(T0_MS + 60_000);
      expect(slotUnlockAtMs(game([0, 60, 600]), 2)).toBe(T0_MS + 600_000);
    });

    it("throws 500 when slotIndex is out of range", () => {
      expect(() => slotUnlockAtMs(game([0, 60]), 3)).toThrow(HttpError);
    });
  });

  describe("isSlotUnlocked", () => {
    it("returns true for slot 0 at any time at or after startedAt", () => {
      expect(isSlotUnlocked(game([0, 60]), 0, T0_MS)).toBe(true);
      expect(isSlotUnlocked(game([0, 60]), 0, T0_MS + 5_000)).toBe(true);
    });

    it("returns false before unlock time and true at/after", () => {
      const g = game([0, 60]);
      expect(isSlotUnlocked(g, 1, T0_MS + 59_999)).toBe(false);
      expect(isSlotUnlocked(g, 1, T0_MS + 60_000)).toBe(true);
      expect(isSlotUnlocked(g, 1, T0_MS + 60_001)).toBe(true);
    });
  });

  describe("assertSlotUnlocked", () => {
    it("does nothing when unlocked", () => {
      expect(() =>
        assertSlotUnlocked(game([0, 60]), 0, "Slot 0 at STN_01", T0_MS),
      ).not.toThrow();
      expect(() =>
        assertSlotUnlocked(game([0, 60]), 1, "Slot 1 at STN_01", T0_MS + 60_000),
      ).not.toThrow();
    });

    it("throws 409 slot_locked with the unlock timestamp in the message", () => {
      try {
        assertSlotUnlocked(game([0, 60]), 1, "Slot 1 at STN_42", T0_MS + 30_000);
        expect.fail("expected assertSlotUnlocked to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(HttpError);
        const err = e as HttpError;
        expect(err.status).toBe(409);
        expect(err.code).toBe("slot_locked");
        expect(err.message).toContain("Slot 1 at STN_42");
        expect(err.message).toContain(new Date(T0_MS + 60_000).toISOString());
      }
    });
  });

  describe("unlockedSlotIndices", () => {
    it("returns all slots when all unlocked", () => {
      expect(unlockedSlotIndices(game([0, 60, 120]), 3, T0_MS + 200_000)).toEqual(
        [0, 1, 2],
      );
    });

    it("returns the prefix that's currently unlocked", () => {
      expect(unlockedSlotIndices(game([0, 60, 120]), 3, T0_MS + 90_000)).toEqual(
        [0, 1],
      );
    });

    it("returns only slot 0 at game start", () => {
      expect(unlockedSlotIndices(game([0, 60, 120]), 3, T0_MS)).toEqual([0]);
    });

    it("supports non-monotonic offsets (a 'later' slot can still gate a higher index)", () => {
      // Pathological but legal: slot 1 unlocks at 300s, slot 2 at 60s.
      // The helper checks each independently rather than assuming sort.
      expect(
        unlockedSlotIndices(game([0, 300, 60]), 3, T0_MS + 90_000),
      ).toEqual([0, 2]);
    });
  });

  describe("isSlotMapVisible", () => {
    it("returns the flag at the requested index", () => {
      expect(isSlotMapVisible([true, false, true], 0)).toBe(true);
      expect(isSlotMapVisible([true, false, true], 1)).toBe(false);
      expect(isSlotMapVisible([true, false, true], 2)).toBe(true);
    });

    it("throws 500 when slotIndex is out of range", () => {
      expect(() => isSlotMapVisible([true], 1)).toThrow(HttpError);
    });
  });

  describe("mapVisibleSlotIndices", () => {
    it("returns only the map-visible indices", () => {
      expect(mapVisibleSlotIndices([true, false, false], 3)).toEqual([0]);
      expect(mapVisibleSlotIndices([true, false, true], 3)).toEqual([0, 2]);
      expect(mapVisibleSlotIndices([true, true, true], 3)).toEqual([0, 1, 2]);
    });
  });

  describe("phaseDrivenMapVisibleSlotIndices", () => {
    it("returns one slot per phase when phase count matches slots per node", () => {
      expect(phaseDrivenMapVisibleSlotIndices(0, 3, 3)).toEqual([0]);
      expect(phaseDrivenMapVisibleSlotIndices(1, 3, 3)).toEqual([1]);
      expect(phaseDrivenMapVisibleSlotIndices(2, 3, 3)).toEqual([2]);
    });

    it("returns null when counts do not match or slotsPerNode <= 1", () => {
      expect(phaseDrivenMapVisibleSlotIndices(0, 3, 4)).toBeNull();
      expect(phaseDrivenMapVisibleSlotIndices(0, 1, 1)).toBeNull();
    });

    it("returns empty when phase is out of range", () => {
      expect(phaseDrivenMapVisibleSlotIndices(3, 3, 3)).toEqual([]);
    });
  });
});
