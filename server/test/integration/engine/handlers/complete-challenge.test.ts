import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameChallengeInstance } from "../../../../src/models/game-challenge-instance.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import {
  attachChallengeToGameNode,
  clearTestChallenges,
} from "../../../setup/challenges.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

async function startInstance(args: {
  gameId: string;
  gameTeamId: string;
  challengeId: string;
  gameNodeChallengeId: string;
}): Promise<GameChallengeInstance> {
  return GameChallengeInstance.create({
    gameId: args.gameId,
    gameTeamId: args.gameTeamId,
    challengeId: args.challengeId,
    gameNodeChallengeId: args.gameNodeChallengeId,
    status: "in_progress",
    assignedAt: new Date(),
  });
}

describe("CHALLENGE_COMPLETED handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("transitions the instance to completed, stamps cooldown, and grants a swap credit", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const instance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });

    const before = Date.now();
    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_COMPLETED",
      payload: { instanceId: instance.id },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHALLENGE_COMPLETED");
    expect(event!.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      challengeId: seed.challengeId,
      instanceId: instance.id,
    });
    const cooldownIso = (event!.payload as { cooldownUntil: string }).cooldownUntil;
    expect(new Date(cooldownIso).getTime()).toBeGreaterThanOrEqual(
      before + 5 * 60 * 1000 - 1000,
    );

    const refreshedInstance = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshedInstance?.status).toBe("completed");
    expect(refreshedInstance?.resolvedAt).toBeInstanceOf(Date);
    expect(refreshedInstance?.cooldownUntil).toBeInstanceOf(Date);
    expect(refreshedInstance?.resolutionPayload).toEqual({ reason: "completed" });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(true);
    expect(position?.creditEarnedInSession).toBe(true);
  });

  it("rejects with not_found when the instance id is unknown", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: { instanceId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("rejects with forbidden when the instance belongs to another team", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
    });
    const onTeamOne = fixture.participants[0]!;
    const otherTeamId = fixture.gameTeamIdBySlot.get(2)!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const otherTeamInstance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: otherTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: onTeamOne.gameTeamId,
        userId: onTeamOne.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: { instanceId: otherTeamInstance.id },
      }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rejects with challenge_not_in_progress when the instance is already resolved", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const instance = await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "completed",
      assignedAt: new Date(),
      resolvedAt: new Date(),
      cooldownUntil: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: { instanceId: instance.id },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "challenge_not_in_progress",
    });
  });

  it("rejects with not_checked_in when the team is no longer at the station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const instance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });
    // Simulate a stale position where the team has stepped away
    // without triggering the normal auto-forfeit (defensive guard).
    await GameTeamPosition.update(
      { currentGameNodeId: null, checkedInAt: null },
      { where: { gameTeamId: participant.gameTeamId } },
    );

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: { instanceId: instance.id },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("rejects with invalid_payload when instanceId is missing", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  it("rejects with hand_completed when the team has already claimed a winning tile (Phase J lock)", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    // Plant a stale in_progress row so the handler would otherwise have
    // real work to do — the hand-completed lock must reject before any
    // of that runs.
    const instance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_COMPLETED",
        payload: { instanceId: instance.id },
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });

  // -------------------------------------------------------------------------
  // Phase L: geolocation telemetry. Fixture node bay = index 0 → 43.65 /
  // -79.38, 100 m radius.
  // -------------------------------------------------------------------------

  it("Phase L: CHALLENGE_COMPLETED with valid in-fence geo lifts geo+warning:false and populates last_known_*", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const instance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });
    const sample = { latitude: 43.65, longitude: -79.38, accuracy: 10 };

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_COMPLETED",
      payload: { instanceId: instance.id, geo: sample },
    });

    expect(result.events[0]!.payload).toMatchObject({
      nodeId: bayId,
      geo: sample,
      geolocationWarning: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBe(43.65);
    expect(position?.lastKnownAccuracy).toBe(10);
    expect(position?.lastKnownSeenAt).toBeInstanceOf(Date);
    // Existing per-session credit semantics still apply (the geo path
    // rides along on the same position.save).
    expect(position?.pendingSwapCredit).toBe(true);
    expect(position?.creditEarnedInSession).toBe(true);
  });

  it("Phase L: CHALLENGE_COMPLETED with malformed geo silently drops it and still resolves the instance", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    const instance = await startInstance({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_COMPLETED",
      payload: { instanceId: instance.id, geo: "not-an-object" },
    });

    expect(result.events[0]!.eventType).toBe("CHALLENGE_COMPLETED");
    expect(result.events[0]!.payload).not.toHaveProperty("geo");
    expect(result.events[0]!.payload).not.toHaveProperty("geolocationWarning");

    const refreshed = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshed?.status).toBe("completed");

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBeNull();
  });
});
