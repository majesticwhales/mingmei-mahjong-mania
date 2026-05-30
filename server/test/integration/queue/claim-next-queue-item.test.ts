import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sequelize } from "../../../src/config/database.ts";
import { GameCommandQueueItem } from "../../../src/models/game-command-queue-item.ts";
import { claimNextQueueItem } from "../../../src/queue/claim-next-queue-item.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupStartedGame, type ParticipantFixture } from "../../setup/game.ts";

async function insertItem(
  gameId: string,
  participant: ParticipantFixture,
  overrides: {
    status?: "pending" | "processing" | "done" | "failed";
    commandType?: string;
    payload?: Record<string, unknown>;
  } = {},
): Promise<GameCommandQueueItem> {
  return GameCommandQueueItem.create({
    gameId,
    gameTeamId: participant.gameTeamId,
    userId: participant.userId,
    commandType: overrides.commandType ?? "CHECK_IN",
    payload: overrides.payload ?? { nodeCode: "bay" },
    status: overrides.status ?? "pending",
    clientCommandId: randomUUID(),
  });
}

describe("claimNextQueueItem", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns null when there are no pending items", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const claimed = await sequelize.transaction((t) =>
      claimNextQueueItem(fixture.gameId, t),
    );
    expect(claimed).toBeNull();
  });

  it("ignores non-pending items", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const participant = fixture.participants[0]!;
    await insertItem(fixture.gameId, participant, { status: "done" });
    await insertItem(fixture.gameId, participant, { status: "processing" });
    await insertItem(fixture.gameId, participant, { status: "failed" });

    const claimed = await sequelize.transaction((t) =>
      claimNextQueueItem(fixture.gameId, t),
    );
    expect(claimed).toBeNull();
  });

  it("ignores pending items belonging to another game", async () => {
    const a = await setupStartedGame({ defaultStartNodeCode: null });
    const b = await setupStartedGame({ defaultStartNodeCode: null });
    await insertItem(b.gameId, b.participants[0]!);

    const claimed = await sequelize.transaction((t) =>
      claimNextQueueItem(a.gameId, t),
    );
    expect(claimed).toBeNull();
  });

  it("claims the oldest pending item and flips its status to processing", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const participant = fixture.participants[0]!;
    const older = await insertItem(fixture.gameId, participant);
    await new Promise((r) => setTimeout(r, 10));
    const newer = await insertItem(fixture.gameId, participant);

    const claimed = await sequelize.transaction((t) =>
      claimNextQueueItem(fixture.gameId, t),
    );

    expect(claimed?.id).toBe(older.id);
    expect(claimed?.status).toBe("processing");
    const persisted = await GameCommandQueueItem.findByPk(older.id);
    expect(persisted?.status).toBe("processing");
    const untouched = await GameCommandQueueItem.findByPk(newer.id);
    expect(untouched?.status).toBe("pending");
  });

  it("two concurrent claims pick distinct items (skip locked)", async () => {
    const fixture = await setupStartedGame({ defaultStartNodeCode: null });
    const participant = fixture.participants[0]!;
    await insertItem(fixture.gameId, participant);
    await insertItem(fixture.gameId, participant);

    const [a, b] = await Promise.all([
      sequelize.transaction(async (t1) => {
        const item = await claimNextQueueItem(fixture.gameId, t1);
        await new Promise((r) => setTimeout(r, 150));
        return item?.id ?? null;
      }),
      sequelize.transaction(async (t2) => {
        await new Promise((r) => setTimeout(r, 50));
        const item = await claimNextQueueItem(fixture.gameId, t2);
        return item?.id ?? null;
      }),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });
});
