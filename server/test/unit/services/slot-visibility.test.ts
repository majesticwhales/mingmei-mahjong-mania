import { describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import {
  assertSlotUnlocked,
  isSlotMapUnlocked,
  isSlotUnlocked,
  mapUnlockedSlotIndices,
  phaseDrivenMapVisibleSlotIndices,
  slotMapUnlockAtMs,
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

const mapGame = (mapOffsets: Array<number | null>) => ({
  id: "game-1",
  startedAt: T0,
  slotMapUnlockOffsetsSeconds: mapOffsets,
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

  describe("slotMapUnlockAtMs", () => {
    it("returns startedAt for slot 0 (always immediately on-map)", () => {
      expect(slotMapUnlockAtMs(mapGame([0, 60, 600]), 0)).toBe(T0_MS);
    });

    it("returns startedAt + offset*1000 for non-zero slots", () => {
      expect(slotMapUnlockAtMs(mapGame([0, 60, 600]), 1)).toBe(T0_MS + 60_000);
      expect(slotMapUnlockAtMs(mapGame([0, 60, 600]), 2)).toBe(T0_MS + 600_000);
    });

    it("returns null when the offset is null (slot never on map)", () => {
      expect(slotMapUnlockAtMs(mapGame([0, null, 60]), 1)).toBeNull();
    });

    it("throws 500 when slotIndex is out of range", () => {
      expect(() => slotMapUnlockAtMs(mapGame([0, 60]), 3)).toThrow(HttpError);
    });
  });

  describe("isSlotMapUnlocked", () => {
    it("returns true for slot 0 at any time at or after startedAt", () => {
      expect(isSlotMapUnlocked(mapGame([0, 60]), 0, T0_MS)).toBe(true);
      expect(isSlotMapUnlocked(mapGame([0, 60]), 0, T0_MS + 5_000)).toBe(true);
    });

    it("returns false before unlock time and true at/after", () => {
      const g = mapGame([0, 60]);
      expect(isSlotMapUnlocked(g, 1, T0_MS + 59_999)).toBe(false);
      expect(isSlotMapUnlocked(g, 1, T0_MS + 60_000)).toBe(true);
    });

    it("always returns false for null offsets (never on map)", () => {
      const g = mapGame([0, null, 60]);
      expect(isSlotMapUnlocked(g, 1, T0_MS)).toBe(false);
      expect(isSlotMapUnlocked(g, 1, T0_MS + 1_000_000)).toBe(false);
    });
  });

  describe("mapUnlockedSlotIndices", () => {
    it("returns only the slots whose map-unlock has elapsed", () => {
      expect(
        mapUnlockedSlotIndices(mapGame([0, 60, 120]), 3, T0_MS + 90_000),
      ).toEqual([0, 1]);
    });

    it("skips null offsets (never on map)", () => {
      expect(
        mapUnlockedSlotIndices(mapGame([0, null, 60]), 3, T0_MS + 1_000_000),
      ).toEqual([0, 2]);
    });

    it("returns only slot 0 at game start", () => {
      expect(mapUnlockedSlotIndices(mapGame([0, 60, 120]), 3, T0_MS)).toEqual([
        0,
      ]);
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
