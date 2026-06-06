import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameChallengeInstance } from "../../../../src/models/game-challenge-instance.ts";
import { GameNode } from "../../../../src/models/game-node.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import {
  attachChallengeToGameNode,
  clearTestChallenges,
} from "../../../setup/challenges.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

describe("CHECK_OUT handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("clears the team's position and emits a CHECK_OUT event", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: {},
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHECK_OUT");
    expect(event!.payload).toEqual({
      nodeId: bayNode!.id,
      nodeCode: "bay",
      implicit: false,
    });
    expect(event!.actorGameTeamId).toBe(participant.gameTeamId);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBeNull();
    expect(position?.checkedInAt).toBeNull();
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_OUT",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("auto-forfeits an in-progress challenge before emitting CHECK_OUT", async () => {
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

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: {},
    });

    expect(result.events.map((e) => e.eventType)).toEqual([
      "CHALLENGE_FORFEITED",
      "CHECK_OUT",
    ]);
    const forfeit = result.events[0]!;
    expect(forfeit.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      challengeId: seed.challengeId,
      instanceId: instance.id,
      reason: "checkout",
    });

    const refreshed = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshed?.status).toBe("failed");
    expect(refreshed?.resolutionPayload).toEqual({ reason: "checkout" });
    expect(refreshed?.cooldownUntil).toBeInstanceOf(Date);
  });

  it("resets pending_swap_credit + credit_earned_in_session on check-out", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    await GameTeamPosition.update(
      { pendingSwapCredit: true, creditEarnedInSession: true },
      { where: { gameTeamId: participant.gameTeamId } },
    );

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: {},
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.pendingSwapCredit).toBe(false);
    expect(position?.creditEarnedInSession).toBe(false);
  });
});
