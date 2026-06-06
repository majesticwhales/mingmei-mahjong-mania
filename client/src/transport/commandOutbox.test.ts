import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { enqueueRow, hydrateOutbox, listForGame } from "./commandOutbox";

describe("commandOutbox", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  it("enqueues and hydrates rows", async () => {
    await enqueueRow({
      clientCommandId: "c1",
      gameId: "g1",
      gameTeamId: "t1",
      commandType: "CHECK_IN",
      payload: { nodeId: "n1" },
      enqueuedAt: Date.now(),
      status: "pending",
      attempts: 0,
    });

    const rows = await hydrateOutbox();
    expect(rows).toHaveLength(1);
    const listed = await listForGame("g1");
    expect(listed[0].clientCommandId).toBe("c1");
  });
});
