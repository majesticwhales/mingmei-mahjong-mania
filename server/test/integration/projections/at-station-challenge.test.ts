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
      imageUrl: null,
      status: "available",
    });
  });

  it("round-trips imageUrl from challenges.image_url through AtStationChallengeDto", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({
      gameNodeId: bayId,
      title: "Bay meet-cute",
      description: "Find someone in a red scarf.",
      imageUrl: "/challenges/bay.png",
    });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );

    expect(projection.atStation!.currentChallenge).toEqual({
      challengeId: seed.challengeId,
      title: "Bay meet-cute",
      description: "Find someone in a red scarf.",
      flavorText: null,
      imageUrl: "/challenges/bay.png",
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

  describe("per-team challenge cycle at multi-challenge stations", () => {
    // The picker rule (see `pickCurrentChallengeForTeam`):
    //   * no prior attempt -> sort_order 0
    //   * latest is `in_progress` or `failed` -> pin same row
    //   * latest is `completed` -> advance, wrap at end
    // These tests cover the rule end-to-end against `buildCurrentChallenge`;
    // the parallel set in `start-challenge.test.ts` covers the handler.
    interface QueuedSeed {
      challengeId: string;
      gameNodeChallengeId: string;
      title: string;
    }

    async function seedQueue(
      gameNodeId: string,
      titles: ReadonlyArray<string>,
    ): Promise<QueuedSeed[]> {
      const out: QueuedSeed[] = [];
      for (let i = 0; i < titles.length; i += 1) {
        const seed = await attachChallengeToGameNode({
          gameNodeId,
          sortOrder: i,
          title: titles[i]!,
        });
        out.push({
          challengeId: seed.challengeId,
          gameNodeChallengeId: seed.gameNodeChallengeId,
          title: titles[i]!,
        });
      }
      return out;
    }

    async function seedResolvedInstance(args: {
      gameId: string;
      gameTeamId: string;
      seed: QueuedSeed;
      status: "completed" | "failed";
      reason: "completed" | "explicit" | "checkout";
      cooldownAgoMs?: number;
    }): Promise<void> {
      const now = Date.now();
      // Default cooldown ten minutes in the past so the row is no
      // longer cooldown-gated when the projection samples it.
      const cooldownAt = new Date(now - (args.cooldownAgoMs ?? 10 * 60 * 1000));
      const resolvedAt = new Date(cooldownAt.getTime() - 1_000);
      await GameChallengeInstance.create({
        gameId: args.gameId,
        gameTeamId: args.gameTeamId,
        challengeId: args.seed.challengeId,
        gameNodeChallengeId: args.seed.gameNodeChallengeId,
        status: args.status,
        assignedAt: new Date(resolvedAt.getTime() - 60_000),
        resolvedAt,
        cooldownUntil: cooldownAt,
        resolutionPayload: { reason: args.reason },
      });
    }

    it("surfaces sort_order=0 on a team's first visit", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const [first] = await seedQueue(bayId, ["First", "Second", "Third"]);

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        first!.challengeId,
      );
      expect(projection.atStation!.currentChallenge!.title).toBe("First");
      expect(projection.atStation!.currentChallenge!.status).toBe("available");
    });

    it("advances to the next sort_order after the team completes the current row", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "completed",
        reason: "completed",
      });

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[1]!.challengeId,
      );
      expect(projection.atStation!.currentChallenge!.title).toBe("Second");
      // `seedResolvedInstance` defaults to a cooldown 10min in the past,
      // so the station-wide gate is already elapsed and the cycled-to
      // row surfaces as `available`. The next test pins the same setup
      // with a future cooldown to verify the gate fires.
      expect(projection.atStation!.currentChallenge!.status).toBe("available");
    });

    it("gates the cycled-to row with the prior completion's cooldown until it elapses", async () => {
      // Regression: before this fix, completing a row stamped
      // `cooldown_until` on that row but the projection only checked
      // the *picked* row's history. After the cycle advanced past the
      // completed row the cooldown was invisible, so the next card
      // surfaced as `available` immediately. Cooldown is station-wide
      // now — the latest resolution at the node gates any new
      // `START_CHALLENGE` regardless of which row the cycle has
      // advanced to.
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      // Future cooldown so the gate is active when the projection
      // samples it.
      const futureCooldownAgoMs = -5 * 60 * 1000;
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "completed",
        reason: "completed",
        cooldownAgoMs: futureCooldownAgoMs,
      });

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      // Cycle advanced past the completed row…
      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[1]!.challengeId,
      );
      // …but the station-wide cooldown still applies until row 0's
      // `cooldown_until` elapses.
      expect(projection.atStation!.currentChallenge!.status).toBe("cooldown");
      expect(
        new Date(
          projection.atStation!.currentChallenge!.cooldownUntil!,
        ).getTime(),
      ).toBeGreaterThan(Date.now());
    });

    it("pins to the same row after an explicit forfeit and surfaces its cooldown", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      // Cooldown still in the future to assert it surfaces.
      const futureCooldownAgoMs = -5 * 60 * 1000;
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "failed",
        reason: "explicit",
        cooldownAgoMs: futureCooldownAgoMs,
      });

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[0]!.challengeId,
      );
      expect(projection.atStation!.currentChallenge!.status).toBe("cooldown");
    });

    it("treats an auto-forfeit (reason='checkout') the same as an explicit forfeit", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "failed",
        reason: "checkout",
      });

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[0]!.challengeId,
      );
    });

    it("wraps back to sort_order=0 after the team completes every row in the queue", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      // Seed completions chronologically — `createdAt` ordering matters
      // because the picker keys off the team's most-recent instance.
      for (let i = 0; i < queue.length; i += 1) {
        await seedResolvedInstance({
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          seed: queue[i]!,
          status: "completed",
          reason: "completed",
          // Older completions first; latest = the last row.
          cooldownAgoMs: (queue.length - i) * 10 * 60 * 1000,
        });
      }

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[0]!.challengeId,
      );
      // Row 0 has its own (long-elapsed) completion; cooldown decoded
      // as elapsed -> status stays `available`.
      expect(projection.atStation!.currentChallenge!.status).toBe("available");
    });

    it("scopes the cycle per team — team A's completions don't advance team B's pick", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay", 2: "bay" },
      });
      const teamA = fixture.participants[0]!;
      const teamB = fixture.participants[1]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: teamA.gameTeamId,
        seed: queue[0]!,
        status: "completed",
        reason: "completed",
      });

      const projectionA = await buildGameStateProjection(
        fixture.gameId,
        teamA.gameTeamId,
      );
      const projectionB = await buildGameStateProjection(
        fixture.gameId,
        teamB.gameTeamId,
      );

      expect(projectionA.atStation!.currentChallenge!.challengeId).toBe(
        queue[1]!.challengeId,
      );
      expect(projectionB.atStation!.currentChallenge!.challengeId).toBe(
        queue[0]!.challengeId,
      );
    });

    it("pins to the in-progress row even when it isn't sort_order=0", async () => {
      // Mid-attempt the player must keep seeing the card they started.
      // Simulate the rare race where the team somehow started row 1
      // directly (e.g. row 0 was completed, then row 1 started, then
      // the projection is sampled).
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, ["First", "Second", "Third"]);
      // Older completion on row 0 followed by an in-progress row 1.
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "completed",
        reason: "completed",
      });
      const inFlight = await GameChallengeInstance.create({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        challengeId: queue[1]!.challengeId,
        gameNodeChallengeId: queue[1]!.gameNodeChallengeId,
        status: "in_progress",
        assignedAt: new Date(),
      });

      const projection = await buildGameStateProjection(
        fixture.gameId,
        participant.gameTeamId,
      );

      expect(projection.atStation!.currentChallenge!.challengeId).toBe(
        queue[1]!.challengeId,
      );
      expect(projection.atStation!.currentChallenge!.status).toBe("in_progress");
      expect(projection.atStation!.currentChallenge!.instanceId).toBe(
        inFlight.id,
      );
    });
  });

  it("short-circuits atStation to null once the team is hand-completed (Phase J)", async () => {
    // Phase J: even when the position row still points at a real station
    // with an in-progress challenge, a hand-completed team's projection
    // must hide the swap controls. The projection short-circuits both
    // `atStation` and the `currentChallenge` sub-fetch so the client
    // flips to the read-only post-claim banner.
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
      handTilesBySlot: { 1: 1 },
      markTeamHandCompleted: 1,
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    const projection = await buildGameStateProjection(
      fixture.gameId,
      participant.gameTeamId,
    );
    expect(projection.atStation).toBeNull();
    expect(projection.handCompleted).not.toBeNull();
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
