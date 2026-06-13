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

describe("START_CHALLENGE handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });
  afterEach(async () => {
    await truncateMutableTables(await getSequelize());
    await clearTestChallenges();
  });

  it("creates an in_progress instance and emits START_CHALLENGE", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("START_CHALLENGE");
    expect(event!.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      challengeId: seed.challengeId,
    });
    const instanceId = (event!.payload as { instanceId: string }).instanceId;
    expect(typeof instanceId).toBe("string");

    const instance = await GameChallengeInstance.findByPk(instanceId);
    expect(instance?.status).toBe("in_progress");
    expect(instance?.gameTeamId).toBe(participant.gameTeamId);
    expect(instance?.gameNodeChallengeId).toBe(seed.gameNodeChallengeId);
    expect(instance?.resolvedAt).toBeNull();
    expect(instance?.cooldownUntil).toBeNull();
  });

  it("rejects with not_checked_in when the team has no current station", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "not_checked_in" });
  });

  it("rejects with wrong_node when nodeId differs from the team's current station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bloorId = fixture.nodeIdByCode.get("bloor-yonge")!;
    await attachChallengeToGameNode({ gameNodeId: bloorId });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bloorId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "wrong_node" });
  });

  it("rejects with no_challenge_at_station when the node has no challenges configured", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "no_challenge_at_station" });
  });

  it("rejects with credit_already_used when the team has banked a credit this session", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameTeamPosition.update(
      { creditEarnedInSession: true },
      { where: { gameTeamId: participant.gameTeamId } },
    );

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "credit_already_used" });
  });

  it("rejects with challenge_in_progress when the team already has an open instance", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameChallengeInstance.create({
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
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "challenge_in_progress" });
  });

  it("rejects with challenge_on_cooldown when the team's last attempt is still cooling down", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "failed",
      assignedAt: new Date(Date.now() - 60 * 1000),
      resolvedAt: new Date(Date.now() - 30 * 1000),
      cooldownUntil: new Date(Date.now() + 60 * 1000),
      resolutionPayload: { reason: "explicit" },
    });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "challenge_on_cooldown" });
  });

  it("permits a fresh start once the prior cooldown has elapsed", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    const seed = await attachChallengeToGameNode({ gameNodeId: bayId });
    await GameChallengeInstance.create({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      challengeId: seed.challengeId,
      gameNodeChallengeId: seed.gameNodeChallengeId,
      status: "completed",
      assignedAt: new Date(Date.now() - 10 * 60 * 1000),
      resolvedAt: new Date(Date.now() - 6 * 60 * 1000),
      cooldownUntil: new Date(Date.now() - 60 * 1000),
      resolutionPayload: { reason: "completed" },
    });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("START_CHALLENGE");
  });

  describe("per-team challenge cycle at multi-challenge stations", () => {
    // Mirrors the projection's cycle coverage in
    // `at-station-challenge.test.ts`. Here we verify that the handler
    // creates the new in_progress instance against the row the picker
    // resolves to (so the projection + handler agree).
    interface QueuedSeed {
      challengeId: string;
      gameNodeChallengeId: string;
    }

    async function seedQueue(
      gameNodeId: string,
      count: number,
    ): Promise<QueuedSeed[]> {
      const out: QueuedSeed[] = [];
      for (let i = 0; i < count; i += 1) {
        const seed = await attachChallengeToGameNode({
          gameNodeId,
          sortOrder: i,
          title: `Card ${i}`,
        });
        out.push({
          challengeId: seed.challengeId,
          gameNodeChallengeId: seed.gameNodeChallengeId,
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
      // Default cooldown ten minutes in the past so the cooldown gate
      // doesn't block the follow-up START_CHALLENGE.
      const cooldownAt = new Date(
        Date.now() - (args.cooldownAgoMs ?? 10 * 60 * 1000),
      );
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

    it("creates an instance against sort_order=0 on the team's first visit", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);

      const result = await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      });
      const payload = result.events[0]!.payload as { challengeId: string };
      expect(payload.challengeId).toBe(queue[0]!.challengeId);

      const instances = await GameChallengeInstance.findAll({
        where: { gameTeamId: participant.gameTeamId },
      });
      expect(instances).toHaveLength(1);
      expect(instances[0]!.gameNodeChallengeId).toBe(
        queue[0]!.gameNodeChallengeId,
      );
    });

    it("advances to the next sort_order after the team completes the current row", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "completed",
        reason: "completed",
      });

      const result = await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      });
      const payload = result.events[0]!.payload as {
        challengeId: string;
        instanceId: string;
      };
      expect(payload.challengeId).toBe(queue[1]!.challengeId);
      const inserted = await GameChallengeInstance.findByPk(payload.instanceId);
      expect(inserted?.gameNodeChallengeId).toBe(queue[1]!.gameNodeChallengeId);
    });

    it("pins to the same row after a failed attempt (cooldown elapsed)", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "failed",
        reason: "explicit",
      });

      const result = await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      });
      const payload = result.events[0]!.payload as { challengeId: string };
      expect(payload.challengeId).toBe(queue[0]!.challengeId);
    });

    it("pins to the same row after an auto-forfeit (reason='checkout')", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "failed",
        reason: "checkout",
      });

      const result = await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      });
      const payload = result.events[0]!.payload as { challengeId: string };
      expect(payload.challengeId).toBe(queue[0]!.challengeId);
    });

    it("wraps back to sort_order=0 after the team completes every row in the queue", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);
      for (let i = 0; i < queue.length; i += 1) {
        await seedResolvedInstance({
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          seed: queue[i]!,
          status: "completed",
          reason: "completed",
          // Older completions first; latest = last row in sort_order.
          cooldownAgoMs: (queue.length - i) * 10 * 60 * 1000,
        });
      }

      const result = await processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      });
      const payload = result.events[0]!.payload as { challengeId: string };
      expect(payload.challengeId).toBe(queue[0]!.challengeId);
    });

    it("respects cooldown when pinned to a failed row", async () => {
      const fixture = await setupLightweightGame({
        nodeCodes: ["bay"],
        startNodeCodeBySlot: { 1: "bay" },
      });
      const participant = fixture.participants[0]!;
      const bayId = fixture.nodeIdByCode.get("bay")!;
      const queue = await seedQueue(bayId, 3);
      // Future cooldown on the failed row.
      await seedResolvedInstance({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        seed: queue[0]!,
        status: "failed",
        reason: "explicit",
        cooldownAgoMs: -5 * 60 * 1000,
      });

      await expect(
        processCommand({
          gameId: fixture.gameId,
          gameTeamId: participant.gameTeamId,
          userId: participant.userId,
          commandType: "START_CHALLENGE",
          payload: { nodeId: bayId },
        }),
      ).rejects.toMatchObject({ status: 409, code: "challenge_on_cooldown" });
    });
  });

  it("rejects with invalid_payload when nodeId is missing", async () => {
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
        commandType: "START_CHALLENGE",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  it("rejects with node_not_in_game when nodeId is unknown", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    // Force a position so the not_checked_in check passes; the unknown
    // nodeId must still fail the wrong_node guard. (node_not_in_game
    // requires the team to be checked in AT a matching nodeId — which
    // they aren't, so wrong_node fires first by design.)
    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 409, code: "wrong_node" });
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
    await attachChallengeToGameNode({ gameNodeId: bayId });

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "START_CHALLENGE",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "hand_completed" });
  });

  // -------------------------------------------------------------------------
  // Phase L: geolocation telemetry. Fixture node bay = index 0 → 43.65 /
  // -79.38, 100 m radius. The shared helper is unit-tested elsewhere; here
  // we just verify the handler wires it through and lifts the result.
  // -------------------------------------------------------------------------

  it("Phase L: START_CHALLENGE with valid in-fence geo lifts geo+warning:false onto the event and populates last_known_*", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });
    const sample = { latitude: 43.65, longitude: -79.38, accuracy: 10 };

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId, geo: sample },
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
  });

  it("Phase L: START_CHALLENGE with malformed geo silently drops it and still creates the instance", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = fixture.nodeIdByCode.get("bay")!;
    await attachChallengeToGameNode({ gameNodeId: bayId });

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "START_CHALLENGE",
      payload: { nodeId: bayId, geo: { accuracy: 10 } },
    });

    expect(result.events[0]!.eventType).toBe("START_CHALLENGE");
    expect(result.events[0]!.payload).not.toHaveProperty("geo");
    expect(result.events[0]!.payload).not.toHaveProperty("geolocationWarning");

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBeNull();
    expect(position?.lastKnownSeenAt).toBeNull();
  });
});
