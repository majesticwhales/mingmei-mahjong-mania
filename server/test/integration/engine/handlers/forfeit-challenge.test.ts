import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { Game } from "../../../../src/models/game.ts";
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
  });

  it("stamps cooldown_until from games.challenge_cooldown_seconds (per-game override)", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    // Use the test-preset value (5s) so the assertion verifies the engine
    // is reading from the per-game column instead of the legacy 5min
    // constant. Default lightweight games inherit 300s from the model.
    await Game.update(
      { challengeCooldownSeconds: 5 },
      { where: { id: fixture.gameId } },
    );
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

    const cooldownIso = (result.events[0]!.payload as { cooldownUntil: string })
      .cooldownUntil;
    const cooldownMs = new Date(cooldownIso).getTime() - before;
    // 5s ± reasonable test-runner slack (well under the legacy 5min floor).
    expect(cooldownMs).toBeGreaterThanOrEqual(5000 - 1000);
    expect(cooldownMs).toBeLessThan(60_000);
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

  // -------------------------------------------------------------------------
  // Phase L: geolocation telemetry. Fixture node bay = index 0 → 43.65 /
  // -79.38, 100 m radius.
  //
  // CHALLENGE_FORFEITED has no checked-in precondition (a team can forfeit
  // even after auto-CHECK_OUT moved them). The handler passes
  // `currentStation: null` to the helper when the team's position no
  // longer matches the challenge's node, so the off-station path is
  // explicitly covered here.
  // -------------------------------------------------------------------------

  it("Phase L: CHALLENGE_FORFEITED with valid in-fence geo (team still at station) lifts geo+warning:false", async () => {
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
    const sample = { latitude: 43.65, longitude: -79.38, accuracy: 10 };

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_FORFEITED",
      payload: { instanceId: instance.id, geo: sample },
    });

    expect(result.events[0]!.payload).toMatchObject({
      nodeId: bayId,
      reason: "explicit",
      geo: sample,
      geolocationWarning: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBe(43.65);
    expect(position?.lastKnownSeenAt).toBeInstanceOf(Date);
  });

  it("Phase L: CHALLENGE_FORFEITED off-station records last_known_* without firing a warning", async () => {
    // Forfeiting after the team has moved off the challenge's node: the
    // helper still records `last_known_*` but explicitly skips the
    // warning evaluation (currentStation = null) because a warning
    // against a station the team has already left would mislead the log.
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
    await GameTeamPosition.update(
      { currentGameNodeId: null, checkedInAt: null },
      { where: { gameTeamId: participant.gameTeamId } },
    );
    // Far from bay; would normally warn, but currentStation is null so
    // the helper short-circuits to warning:false.
    const sample = { latitude: 50.0, longitude: -75.0, accuracy: 10 };

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHALLENGE_FORFEITED",
      payload: { instanceId: instance.id, geo: sample },
    });

    expect(result.events[0]!.payload).toMatchObject({
      nodeId: bayId,
      reason: "explicit",
      geo: sample,
      geolocationWarning: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBe(50.0);
    expect(position?.lastKnownLongitude).toBe(-75.0);
  });

  it("Phase L: CHALLENGE_FORFEITED with malformed geo silently drops it and still fails the instance", async () => {
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
      commandType: "CHALLENGE_FORFEITED",
      payload: { instanceId: instance.id, geo: 42 },
    });

    expect(result.events[0]!.eventType).toBe("CHALLENGE_FORFEITED");
    expect(result.events[0]!.payload).not.toHaveProperty("geo");
    expect(result.events[0]!.payload).not.toHaveProperty("geolocationWarning");

    const refreshed = await GameChallengeInstance.findByPk(instance.id);
    expect(refreshed?.status).toBe("failed");

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastKnownLatitude).toBeNull();
  });
});
