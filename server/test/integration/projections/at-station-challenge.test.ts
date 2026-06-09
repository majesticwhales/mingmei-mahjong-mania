import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGameStateProjection } from "../../../src/projections/game-state.ts";
import { processCommand } from "../../../src/engine/process-command.ts";
import { GameChallengeInstance } from "../../../src/models/game-challenge-instance.ts";
import {
  attachChallengeToGameNode,
  clearTestChallenges,
} from "../../setup/challenges.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Phase H projection coverage for `AtStationDto.currentChallenge` +
 * `pendingSwapCredit` + `creditEarnedInSession`. Each test pins the
 * team at a station, seeds a challenge against that node, and asserts
 * the three observable states (available / in_progress / cooldown)
 * plus credit-flag transitions across the START → COMPLETE → SWAP loop.
 */
describe("buildGameStateProjection - atStation challenge", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("returns currentChallenge=null when the station has no challenges configured", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation).not.toBeNull();
    expect(projection.atStation!.currentChallenge).toBeNull();
    expect(projection.atStation!.pendingSwapCredit).toBe(false);
    expect(projection.atStation!.creditEarnedInSession).toBe(false);
  });

  it("exposes the top challenge with status='available' before the team starts it", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({
      gameNodeId: bayId,
      title: "Tap the pillar",
      description: "Tag the eastern pillar on the platform.",
      flavorText: "Watch your step.",
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge).toEqual({
      challengeId: seed.challengeId,
      title: "Tap the pillar",
      description: "Tag the eastern pillar on the platform.",
      flavorText: "Watch your step.",
      status: "available",
    });
  });

  it("flips to status='in_progress' and exposes instanceId after START_CHALLENGE", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });

    const startResult = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });
    const instanceId = (startResult.events[0]!.payload as { instanceId: string })
      .instanceId;

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge).toMatchObject({
      challengeId: seed.challengeId,
      status: "in_progress",
      instanceId,
    });
    expect(projection.atStation!.currentChallenge).not.toHaveProperty(
      "cooldownUntil",
    );
    expect(projection.atStation!.pendingSwapCredit).toBe(false);
    expect(projection.atStation!.creditEarnedInSession).toBe(false);
  });

  it("flips to status='cooldown' + sets credit flags after CHALLENGE_COMPLETED", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    const startResult = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });
    const instanceId = (startResult.events[0]!.payload as { instanceId: string })
      .instanceId;

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_COMPLETED",
      payload: { instanceId },
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge!.status).toBe("cooldown");
    expect(typeof projection.atStation!.currentChallenge!.cooldownUntil).toBe(
      "string",
    );
    expect(
      new Date(projection.atStation!.currentChallenge!.cooldownUntil!).getTime(),
    ).toBeGreaterThan(Date.now());
    expect(projection.atStation!.currentChallenge).not.toHaveProperty(
      "instanceId",
    );
    expect(projection.atStation!.pendingSwapCredit).toBe(true);
    expect(projection.atStation!.creditEarnedInSession).toBe(true);
  });

  it("flips to status='cooldown' WITHOUT credit after an explicit CHALLENGE_FORFEITED", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    const startResult = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });
    const instanceId = (startResult.events[0]!.payload as { instanceId: string })
      .instanceId;

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_FORFEITED",
      payload: { instanceId },
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge!.status).toBe("cooldown");
    expect(projection.atStation!.pendingSwapCredit).toBe(false);
    expect(projection.atStation!.creditEarnedInSession).toBe(false);
  });

  it("returns to status='available' once the cooldown has elapsed", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    // Seed a directly-resolved instance whose cooldown is already in
    // the past. Bypasses the engine handler to skip the wall-clock wait.
    await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "completed",
      assignedAt: new Date(Date.now() - 20 * 60 * 1000),
      resolvedAt: new Date(Date.now() - 10 * 60 * 1000),
      cooldownUntil: new Date(Date.now() - 5 * 60 * 1000),
      resolutionPayload: { reason: "completed" },
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge!.status).toBe("available");
    expect(projection.atStation!.currentChallenge).not.toHaveProperty(
      "cooldownUntil",
    );
    expect(projection.atStation!.currentChallenge).not.toHaveProperty(
      "instanceId",
    );
  });

  it("consumes pending_swap_credit on SWAP_TILE but keeps creditEarnedInSession sticky", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      nodeTilesByCode: { bay: 1 },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    const startResult = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });
    const instanceId = (startResult.events[0]!.payload as { instanceId: string })
      .instanceId;
    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_COMPLETED",
      payload: { instanceId },
    });

    const afterComplete = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(afterComplete.atStation!.pendingSwapCredit).toBe(true);
    expect(afterComplete.atStation!.creditEarnedInSession).toBe(true);

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "SWAP_TILE",
      payload: {
        handTileId: fixture.handTiles[0]!.gameTileId,
        stationTileId: fixture.nodeTiles[0]!.gameTileId,
      },
    });

    const afterSwap = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(afterSwap.atStation!.pendingSwapCredit).toBe(false);
    expect(afterSwap.atStation!.creditEarnedInSession).toBe(true);
  });

  it("returns the sort_order=0 challenge when a node has multiple challenges queued", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const first = await attachChallengeToGameNode({
      gameNodeId: bayId,
      sortOrder: 0,
      title: "First",
    });
    await attachChallengeToGameNode({
      gameNodeId: bayId,
      sortOrder: 1,
      title: "Second",
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.atStation!.currentChallenge!.challengeId).toBe(
      first.challengeId,
    );
    expect(projection.atStation!.currentChallenge!.title).toBe("First");
  });

  it("scopes challenge state per team — team A's in_progress is invisible to team B", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay", 2: "bay" },
    });
    const teamA = fixture.participants[0]!;
    const teamB = fixture.participants[1]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: teamA.gameTeamId,
      userId: teamA.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });

    const projectionA = await buildGameStateProjection(
      fixture.gameId,
      teamA.gameTeamId,
    );
    const projectionB = await buildGameStateProjection(
      fixture.gameId,
      teamB.gameTeamId,
    );

    expect(projectionA.atStation!.currentChallenge!.status).toBe("in_progress");
    expect(projectionB.atStation!.currentChallenge!.status).toBe("available");
  });
});
