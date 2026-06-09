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

describe("CHALLENGE_FORFEITED handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("transitions the instance to failed, stamps cooldown, and does NOT grant credit", async () => {
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
      status: "in_progress",
      assignedAt: new Date(),
    });

    const before = Date.now();
    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_FORFEITED",
      payload: { instanceId: instance.id },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHALLENGE_FORFEITED");
    expect(event!.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      challengeId: seed.challengeId,
      instanceId: instance.id,
      reason: "explicit",
    });
    const cooldownIso = (event!.payload as { cooldownUntil: string }).cooldownUntil;
    expect(new Date(cooldownIso).getTime()).toBeGreaterThanOrEqual(
      before + 5 * 60 * 1000 - 1000,
    );

    const refreshedInstance = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshedInstance?.status).toBe("failed");
    expect(refreshedInstance?.resolutionPayload).toEqual({ reason: "explicit" });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(false);
    expect(position?.creditEarnedInSession).toBe(false);
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
        commandType: "CHALLENGE_FORFEITED",
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
    const otherInstance = await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: otherTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "in_progress",
      assignedAt: new Date(),
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: onTeamOne.gameTeamId,
        userId: onTeamOne.userId,
        commandType: "CHALLENGE_FORFEITED",
        payload: { instanceId: otherInstance.id },
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
      status: "failed",
      assignedAt: new Date(),
      resolvedAt: new Date(),
      cooldownUntil: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_FORFEITED",
        payload: { instanceId: instance.id },
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "challenge_not_in_progress",
    });
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
        commandType: "CHALLENGE_FORFEITED",
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
    // work to do — the hand-completed lock must reject first.
    const instance = await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "in_progress",
      assignedAt: new Date(),
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHALLENGE_FORFEITED",
        payload: { instanceId: instance.id },
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });
});
