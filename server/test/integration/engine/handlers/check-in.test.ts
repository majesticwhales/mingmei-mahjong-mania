import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { processCommand } from "../../../../src/engine/process-command.ts";
import { GameNode } from "../../../../src/models/game-node.ts";
import { GameTeamPosition } from "../../../../src/models/game-team-position.ts";
import { setupLightweightGame } from "../../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../../setup/db.ts";

async function findNodeIdByCode(
  gameId: string,
  code: string,
): Promise<string> {
  const node = await GameNode.findOne({ where: { gameId, code } });
  if (!node) {
    throw new Error(`Expected node ${code} on game ${gameId}`);
  }
  return node.id;
}

describe("CHECK_IN handler", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("checks an unchecked team in and emits a single CHECK_IN event", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: bayId },
    });

    expect(result.events).toHaveLength(1);
    const [event] = result.events;
    expect(event!.eventType).toBe("CHECK_IN");
    expect(event!.payload).toEqual({ nodeId: bayId, nodeCode: "bay" });
    expect(event!.actorGameTeamId).toBe(participant.gameTeamId);
    expect(event!.actorUserId).toBe(participant.userId);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(bayId);
    expect(position?.checkedInAt).toBeInstanceOf(Date);
  });

  it("performs an implicit check-out when checking in elsewhere", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay", "bloor-yonge"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;

    const targetNode = await GameNode.findOne({
      where: { gameId: fixture.gameId, code: "bloor-yonge" },
    });
    if (!targetNode) {
      throw new Error("Expected bloor-yonge in TTC 2026 template");
    }

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: targetNode.id },
    });

    expect(result.events.map((e) => e.eventType)).toEqual([
      "CHECK_OUT",
      "CHECK_IN",
    ]);
    expect(result.events.map((e) => e.sequence)).toEqual(["1", "2"]);

    const [checkOutEvent, checkInEvent] = result.events;
    expect(checkOutEvent!.payload).toMatchObject({
      nodeCode: "bay",
      implicit: true,
    });
    expect(checkInEvent!.payload).toEqual({
      nodeId: targetNode.id,
      nodeCode: "bloor-yonge",
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(targetNode.id);
  });

  it("rejects with already_at_node when the team is already at the target station", async () => {
    const fixture = await setupLightweightGame({
      nodeCodes: ["bay"],
      startNodeCodeBySlot: { 1: "bay" },
    });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeId: bayId },
      }),
    ).rejects.toMatchObject({ status: 409, code: "already_at_node" });
  });

  it("rejects with node_not_in_game when the nodeId does not belong to the game", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: { nodeId: randomUUID() },
      }),
    ).rejects.toMatchObject({ status: 404, code: "node_not_in_game" });
  });

  it("rejects with invalid_payload when nodeId is missing", async () => {
    const fixture = await setupLightweightGame();
    const participant = fixture.participants[0]!;

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: {},
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });
  });

  // -------------------------------------------------------------------------
  // Phase F: geolocation warn/allow.
  //
  // The lightweight fixture parks nodes at synthetic coords
  // (lat = 43.65 + index * 0.001, lng = -79.38 + index * 0.001) with a 100 m
  // radius. We construct CHECK_IN payloads relative to the first node ("bay"
  // at index 0 → 43.65 / -79.38) to exercise the four warn/validate
  // combinations + the no-geo back-compat path + the malformed-payload path.
  // -------------------------------------------------------------------------

  // ~111_195 m per degree of latitude on a sphere of radius 6_371_000.
  const METERS_PER_DEG_LATITUDE = 111_194.926644;

  it("CHECK_IN with geo inside geofence + tight accuracy validates without warning", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: {
        nodeId: bayId,
        geo: { latitude: 43.65, longitude: -79.38, accuracy: 10 },
      },
    });

    const checkInEvent = result.events.find((e) => e.eventType === "CHECK_IN")!;
    expect(checkInEvent.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      geolocationWarning: false,
      geofenceValidated: true,
    });
    expect(
      (checkInEvent.payload as { distanceMeters: number }).distanceMeters,
    ).toBeCloseTo(0, 6);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastCheckInLatitude).toBe(43.65);
    expect(position?.lastCheckInLongitude).toBe(-79.38);
    expect(position?.geofenceValidated).toBe(true);
    expect(position?.geolocationWarning).toBe(false);
  });

  it("CHECK_IN with geo outside the geofence warns but still succeeds", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    // ~250 m north of the station — well outside the 100 m radius.
    const farLatitude = 43.65 + 250 / METERS_PER_DEG_LATITUDE;

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: {
        nodeId: bayId,
        geo: { latitude: farLatitude, longitude: -79.38, accuracy: 10 },
      },
    });

    const checkInEvent = result.events.find((e) => e.eventType === "CHECK_IN")!;
    expect(checkInEvent.payload).toMatchObject({
      nodeId: bayId,
      nodeCode: "bay",
      geolocationWarning: true,
      geofenceValidated: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBe(bayId); // still checked in
    expect(position?.geofenceValidated).toBe(false);
    expect(position?.geolocationWarning).toBe(true);
  });

  it("CHECK_IN with geo inside the geofence but poor accuracy warns (relative rule)", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    // On the station, but accuracy (150 m) exceeds the 100 m radius.
    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: {
        nodeId: bayId,
        geo: { latitude: 43.65, longitude: -79.38, accuracy: 150 },
      },
    });

    const checkInEvent = result.events.find((e) => e.eventType === "CHECK_IN")!;
    expect(checkInEvent.payload).toMatchObject({
      geolocationWarning: true,
      geofenceValidated: false,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.geofenceValidated).toBe(false);
    expect(position?.geolocationWarning).toBe(true);
  });

  it("CHECK_IN with no geo field leaves all four position columns null and omits flags from the event", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    const result = await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: { nodeId: bayId },
    });

    const checkInEvent = result.events.find((e) => e.eventType === "CHECK_IN")!;
    expect(checkInEvent.payload).toEqual({ nodeId: bayId, nodeCode: "bay" });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.lastCheckInLatitude).toBeNull();
    expect(position?.lastCheckInLongitude).toBeNull();
    expect(position?.geofenceValidated).toBeNull();
    expect(position?.geolocationWarning).toBeNull();
  });

  it("CHECK_IN with malformed geo (missing latitude) rejects with invalid_payload", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    await expect(
      processCommand({
        gameId: fixture.gameId,
        gameTeamId: participant.gameTeamId,
        userId: participant.userId,
        commandType: "CHECK_IN",
        payload: {
          nodeId: bayId,
          geo: { longitude: -79.38, accuracy: 10 },
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "invalid_payload" });

    // No state change on a parse failure: the position row is untouched.
    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: participant.gameTeamId },
    });
    expect(position?.currentGameNodeId).toBeNull();
    expect(position?.lastCheckInLatitude).toBeNull();
  });

  it("CHECK_OUT clears the position row's geo snapshot", async () => {
    const fixture = await setupLightweightGame({ nodeCodes: ["bay"] });
    const participant = fixture.participants[0]!;
    const bayId = await findNodeIdByCode(fixture.gameId, "bay");

    await processCommand({
      gameId: fixture.gameId,
      gameTeamId: participant.gameTeamId,
      userId: participant.userId,
      commandType: "CHECK_IN",
      payload: {
        nodeId: bayId,
        geo: { latitude: 43.65, longitude: -79.38, accuracy: 10 },
      },
    });

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
    expect(position?.currentGameNodeId).toBeNull();
    expect(position?.lastCheckInLatitude).toBeNull();
    expect(position?.lastCheckInLongitude).toBeNull();
    expect(position?.geofenceValidated).toBeNull();
    expect(position?.geolocationWarning).toBeNull();
  });
});
