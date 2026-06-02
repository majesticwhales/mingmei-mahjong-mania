import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import { GameCommandQueueItem } from "../../../src/models/game-command-queue-item.ts";
import { QueueWorker, setQueueWorker } from "../../../src/queue/worker.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";
import { bearer, getAgent, type ApiAgent } from "../../setup/http.ts";

describe("POST /api/games/:id/commands", () => {
  let agent: ApiAgent;
  let queueWorker: QueueWorker;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    agent = await getAgent();
    // Install an explicit-trigger-only worker so HTTP enqueues
    // synchronously drain. Safety-net poll is disabled (large interval)
    // so the test only exercises the explicit path we care about.
    queueWorker = new QueueWorker({ pollIntervalMs: 60_000 });
    setQueueWorker(queueWorker);
  });

  afterEach(async () => {
    await queueWorker.stop();
    setQueueWorker(null);
  });

  it("returns 401 without a bearer token", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(401);
  });

  it("enqueues a valid command and returns 202 with the queue item id", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const token = signAccessToken(participant.userId);
    const clientCommandId = randomUUID();

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId,
      });
    expect(res.status).toBe(202);
    expect(res.body.clientCommandId).toBe(clientCommandId);
    expect(typeof res.body.queueItemId).toBe("string");

    // The trigger fires synchronously after the response; wait for the
    // drain to finish so we can assert the terminal queue state.
    await queueWorker.waitForGame(fixture.gameId);
    const row = await GameCommandQueueItem.findByPk(res.body.queueItemId);
    expect(row?.status).toBe("done");
  });

  it("is idempotent: same clientCommandId + same payload returns the same queueItemId", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const token = signAccessToken(participant.userId);
    const clientCommandId = randomUUID();
    const body = {
      gameTeamId: participant.gameTeamId,
      commandType: "CHECK_IN",
      payload: { nodeId: aId },
      clientCommandId,
    };

    const first = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send(body);
    expect(first.status).toBe(202);

    const second = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send(body);
    expect(second.status).toBe(202);
    expect(second.body.queueItemId).toBe(first.body.queueItemId);

    const rows = await GameCommandQueueItem.findAll({
      where: { gameId: fixture.gameId, clientCommandId },
    });
    expect(rows).toHaveLength(1);
  });

  it("rejects a mismatched-payload duplicate with 409 client_command_id_conflict", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a", "b"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const bId = fixture.nodeIdByCode.get("b")!;
    const token = signAccessToken(participant.userId);
    const clientCommandId = randomUUID();

    const first = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId,
      });
    expect(first.status).toBe(202);

    const second = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: bId },
        clientCommandId,
      });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("client_command_id_conflict");
  });

  it("rejects with 403 forbidden when the user is not on the target team", async () => {
    const fixture = await setupLightweightGame({
      participantCount: 2,
      nodeCodes: ["a"],
    });
    const [pA, pB] = fixture.participants;
    if (!pA || !pB) throw new Error("expected two participants");
    const aId = fixture.nodeIdByCode.get("a")!;
    const tokenA = signAccessToken(pA.userId);

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(tokenA))
      .send({
        gameTeamId: pB.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");

    const rows = await GameCommandQueueItem.findAll({
      where: { gameId: fixture.gameId },
    });
    expect(rows).toHaveLength(0);
  });

  it("rejects with 404 not_found for an unknown gameId", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .post(`/api/games/${randomUUID()}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: randomUUID() },
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("rejects with 400 unknown_command for an unsupported commandType", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "DANCE",
        payload: {},
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unknown_command");
  });

  it("rejects with 400 validation_error when clientCommandId is missing", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: randomUUID() },
        // clientCommandId intentionally omitted
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(res.body.message).toContain("clientCommandId");
  });

  it("rejects with 400 validation_error when payload is an array", async () => {
    const fixture = await setupLightweightGame({ participantCount: 1 });
    const participant = fixture.participants[0]!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: [1, 2, 3],
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("works without a registered QueueWorker — the trigger no-ops and the row stays pending", async () => {
    // Simulate a code path where the HTTP route is hit but no worker is
    // wired in (e.g. a one-off CLI tool that calls into the Express
    // handler directly). The enqueue still succeeds; the safety-net
    // poll on a real deployment eventually drains the row.
    setQueueWorker(null);

    const fixture = await setupLightweightGame({
      participantCount: 1,
      nodeCodes: ["a"],
    });
    const participant = fixture.participants[0]!;
    const aId = fixture.nodeIdByCode.get("a")!;
    const token = signAccessToken(participant.userId);

    const res = await agent
      .post(`/api/games/${fixture.gameId}/commands`)
      .set(bearer(token))
      .send({
        gameTeamId: participant.gameTeamId,
        commandType: "CHECK_IN",
        payload: { nodeId: aId },
        clientCommandId: randomUUID(),
      });
    expect(res.status).toBe(202);

    const row = await GameCommandQueueItem.findByPk(res.body.queueItemId);
    expect(row?.status).toBe("pending");
  });
});
