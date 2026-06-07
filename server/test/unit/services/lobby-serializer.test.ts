import { describe, expect, it, vi } from "vitest";
import type { Lobby } from "../../../src/models/lobby.ts";
import type { LobbyMember } from "../../../src/models/lobby-member.ts";
import type { LobbyTeamAssignment } from "../../../src/models/lobby-team-assignment.ts";
import { computeReadiness } from "../../../src/services/lobby-serializer.ts";

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return {
    status: "waiting",
    minPlayersToStart: 4,
    teamAssignmentMode: "pick",
    ...overrides,
  } as Lobby;
}

function member(userId: string): LobbyMember {
  return { userId, joinedAt: new Date() } as LobbyMember;
}

function assignment(userId: string, teamSlot: number | null): LobbyTeamAssignment {
  return { userId, teamSlot } as LobbyTeamAssignment;
}

describe("computeReadiness", () => {
  const fourMembers = ["a", "b", "c", "d"].map(member);

  it("is ready when pick mode has four players on four teams", () => {
    const readiness = computeReadiness(
      lobby({ teamAssignmentMode: "pick" }),
      fourMembers,
      [
        assignment("a", 1),
        assignment("b", 2),
        assignment("c", 3),
        assignment("d", 4),
      ],
    );
    expect(readiness.ready).toBe(true);
  });

  it("is not ready when a member has not picked a team", () => {
    const readiness = computeReadiness(
      lobby({ teamAssignmentMode: "pick" }),
      fourMembers,
      [
        assignment("a", 1),
        assignment("b", 2),
        assignment("c", 3),
        assignment("d", null),
      ],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons.some((r) => r.includes("pick a team"))).toBe(true);
  });

  it("is not ready when a team has no players in pick mode", () => {
    const readiness = computeReadiness(
      lobby({ teamAssignmentMode: "pick" }),
      fourMembers,
      [
        assignment("a", 1),
        assignment("b", 1),
        assignment("c", 1),
        assignment("d", 1),
      ],
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.missingTeams).toContain(2);
  });

  it("requires at least four players for random mode", () => {
    const readiness = computeReadiness(
      lobby({ teamAssignmentMode: "random" }),
      ["a", "b", "c"].map(member),
      ["a", "b", "c"].map((id) => assignment(id, null)),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons.some((r) => r.includes("random"))).toBe(true);
  });

  it("is ready in mixed mode when pool can fill empty teams", () => {
    const readiness = computeReadiness(
      lobby({ teamAssignmentMode: "mixed" }),
      fourMembers,
      [
        assignment("a", 1),
        assignment("b", 2),
        assignment("c", null),
        assignment("d", null),
      ],
    );
    expect(readiness.ready).toBe(true);
  });

  it("is ready with one player in dev relax mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_RELAX_LOBBY_START", "true");
    try {
      const readiness = computeReadiness(
        lobby({ teamAssignmentMode: "pick" }),
        [member("solo")],
        [assignment("solo", null)],
      );
      expect(readiness.ready).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("is not ready when lobby is not waiting", () => {
    const readiness = computeReadiness(
      lobby({ status: "closed", teamAssignmentMode: "pick" }),
      fourMembers,
      fourMembers.map((m, i) => assignment(m.userId, i + 1)),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons.some((r) => r.includes("not waiting"))).toBe(true);
  });
});
