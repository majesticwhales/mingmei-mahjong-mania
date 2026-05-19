import { afterEach, describe, expect, it, vi } from "vitest";
import * as shuffle from "../../../src/lib/shuffle.ts";
import {
  assignTeamsEvenly,
  resolveTeamsForGameStart,
} from "../../../src/services/even-team-assignment.ts";

describe("assignTeamsEvenly", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("balances four players to one per team", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = assignTeamsEvenly(["a", "b", "c", "d"]);
    const slots = [...result.values()].sort();

    expect(slots).toEqual([1, 2, 3, 4]);
  });

  it("respects existing team counts in mixed mode", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = assignTeamsEvenly(["pool1", "pool2"], {
      "1": 2,
      "2": 1,
      "3": 0,
      "4": 0,
    });

    expect(result.get("pool1")).toBe(3);
    expect(result.get("pool2")).toBe(4);
  });
});

describe("resolveTeamsForGameStart", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pick mode returns explicit slots", () => {
    const result = resolveTeamsForGameStart("pick", [
      { userId: "a", teamSlot: 1 },
      { userId: "b", teamSlot: 2 },
    ]);
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
  });

  it("pick mode rejects unassigned members", () => {
    expect(() =>
      resolveTeamsForGameStart("pick", [
        { userId: "a", teamSlot: 1 },
        { userId: "b", teamSlot: null },
      ]),
    ).toThrow(/must choose a team/);
  });

  it("random mode assigns everyone via even distribution", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = resolveTeamsForGameStart("random", [
      { userId: "a", teamSlot: null },
      { userId: "b", teamSlot: null },
      { userId: "c", teamSlot: null },
      { userId: "d", teamSlot: null },
    ]);

    expect(new Set(result.values())).toEqual(new Set([1, 2, 3, 4]));
  });

  it("mixed mode keeps picks and fills pool", () => {
    vi.spyOn(shuffle, "shuffleInPlace").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = resolveTeamsForGameStart("mixed", [
      { userId: "a", teamSlot: 1 },
      { userId: "b", teamSlot: 2 },
      { userId: "c", teamSlot: null },
      { userId: "d", teamSlot: null },
    ]);

    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(2);
    expect(result.get("c")).toBe(3);
    expect(result.get("d")).toBe(4);
  });
});
