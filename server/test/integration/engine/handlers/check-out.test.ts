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
      nodeName: "bay",
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

  it("resets pending_swap_credit on check-out", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    await GameTeamPosition.update(
      { pendingSwapCredit: true },
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
  });

  // -------------------------------------------------------------------------
  // Phase L: optional `geo` block on CHECK_OUT. Evaluation runs against the
  // station the team is *leaving* (per TDD §3.12 — implicit CHECK_OUTs from
  // a CHECK_IN-elsewhere skip the helper and inherit the parent's geo; that
  // path is covered in check-in.test.ts).
  //
  // Lightweight fixture coords: bay = index 0 → 43.65 / -79.38, 100 m radius.
  // -------------------------------------------------------------------------

  const METERS_PER_DEG_LATITUDE = 111_194.926644;

  it("CHECK_OUT with geo inside the geofence lifts geo + warning:false onto the event", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });

    const sample = { latitude: 43.65, longitude: -79.38, accuracy: 10 };
    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: { geo: sample },
    });

    const event = result.events.find((e) => e.eventType === "CHECK_OUT")!;
    expect(event.payload).toEqual({
      nodeId: bayNode!.id,
      nodeCode: "bay",
      nodeName: "bay",
      implicit: false,
      geo: sample,
      geolocationWarning: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    // last_known_* populated from a valid sample; lastCheckIn* still
    // cleared (CHECK_OUT's existing session-boundary behaviour).
    expect(position?.lastKnownLatitude).toBe(43.65);
    expect(position?.lastKnownLongitude).toBe(-79.38);
    expect(position?.lastKnownAccuracy).toBe(10);
    expect(position?.lastKnownSeenAt).toBeInstanceOf(Date);
    expect(position?.lastCheckInLatitude).toBeNull();
    expect(position?.lastCheckInLongitude).toBeNull();
    expect(position?.geofenceValidated).toBeNull();
    expect(position?.geolocationWarning).toBeNull();
  });

  it("CHECK_OUT with geo far from the leaving station lifts geo + warning:true and still succeeds", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bay" },
    });

    // ~250 m north of bay — well outside the 100 m radius.
    const farLatitude = 43.65 + 250 / METERS_PER_DEG_LATITUDE;
    const sample = { latitude: farLatitude, longitude: -79.38, accuracy: 10 };

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_OUT",
      payload: { geo: sample },
    });

    const event = result.events.find((e) => e.eventType === "CHECK_OUT")!;
    expect(event.payload).toMatchObject({
      nodeId: bayNode!.id,
      nodeCode: "bay",
      implicit: false,
      geo: sample,
      geolocationWarning: true,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBeNull(); // still checks out
    expect(position?.lastKnownLatitude).toBe(farLatitude);
    expect(position?.lastKnownLongitude).toBe(-79.38);
  });

  it("CHECK_OUT with malformed geo silently drops it and still succeeds without geo on the event", async () => {
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
      payload: { geo: { longitude: -79.38, accuracy: 10 } },
    });

    const event = result.events.find((e) => e.eventType === "CHECK_OUT")!;
    expect(event.payload).toEqual({
      nodeId: bayNode!.id,
      nodeCode: "bay",
      nodeName: "bay",
      implicit: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBeNull();
    expect(position?.lastKnownLatitude).toBeNull();
    expect(position?.lastKnownLongitude).toBeNull();
    expect(position?.lastKnownAccuracy).toBeNull();
    expect(position?.lastKnownSeenAt).toBeNull();
  });
});
