import { beforeEach, describe, expect, it } from "vitest";
import { sequelize } from "../../../src/config/database.ts";
import { claimDueJob } from "../../../src/scheduler/claim-due-job.ts";
import { GameScheduledJob } from "../../../src/models/game-scheduled-job.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupStartedGame } from "../../setup/game.ts";

async function clearJobs(gameId: string): Promise<void> {
  await GameScheduledJob.destroy({ where: { gameId } });
}

async function insertJob(
  gameId: string,
  fields: {
    runAt: Date;
    jobType?: "VISIBILITY_PHASE_ADVANCE" | "GAME_END" | "NOTIFICATION";
    status?: "pending" | "processing" | "done" | "failed";
    payload?: Record<string, unknown> | null;
  },
): Promise<GameScheduledJob> {
  return GameScheduledJob.create({
    gameId,
    jobType: fields.jobType ?? "GAME_END",
    runAt: fields.runAt,
    status: fields.status ?? "pending",
    payload: fields.payload ?? null,
  });
}

describe("claimDueJob", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns null when no jobs are pending", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);

    const claimed = await sequelize.transaction((t) =>
      claimDueJob(new Date(), t),
    );
    expect(claimed).toBeNull();
  });

  it("returns null when all pending jobs are still in the future", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const future = new Date(Date.now() + 60 * 1000);
    await insertJob(gameId, { runAt: future });

    const claimed = await sequelize.transaction((t) =>
      claimDueJob(new Date(), t),
    );
    expect(claimed).toBeNull();
  });

  it("ignores jobs in non-pending statuses", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const past = new Date(Date.now() - 60 * 1000);
    await insertJob(gameId, { runAt: past, status: "done" });
    await insertJob(gameId, { runAt: past, status: "processing" });
    await insertJob(gameId, { runAt: past, status: "failed" });

    const claimed = await sequelize.transaction((t) =>
      claimDueJob(new Date(), t),
    );
    expect(claimed).toBeNull();
  });

  it("claims the oldest due job and flips its status to processing", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const t0 = new Date(Date.now() - 60 * 1000);
    const t1 = new Date(Date.now() - 30 * 1000);
    const newer = await insertJob(gameId, { runAt: t1 });
    const older = await insertJob(gameId, { runAt: t0 });

    const claimed = await sequelize.transaction((t) =>
      claimDueJob(new Date(), t),
    );

    expect(claimed?.id).toBe(older.id);
    expect(claimed?.status).toBe("processing");
    const persisted = await GameScheduledJob.findByPk(older.id);
    expect(persisted?.status).toBe("processing");
    const untouched = await GameScheduledJob.findByPk(newer.id);
    expect(untouched?.status).toBe("pending");
  });

  it("uses created_at as the tiebreaker when run_at is identical", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const sameRunAt = new Date(Date.now() - 60 * 1000);
    const first = await insertJob(gameId, { runAt: sameRunAt });
    await new Promise((r) => setTimeout(r, 10));
    const second = await insertJob(gameId, { runAt: sameRunAt });

    const claimed = await sequelize.transaction((t) =>
      claimDueJob(new Date(), t),
    );
    expect(claimed?.id).toBe(first.id);
    const untouched = await GameScheduledJob.findByPk(second.id);
    expect(untouched?.status).toBe("pending");
  });

  it("two concurrent claims pick distinct jobs (skip locked)", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const past = new Date(Date.now() - 60 * 1000);
    await insertJob(gameId, { runAt: past });
    await insertJob(gameId, { runAt: past });

    const [a, b] = await Promise.all([
      sequelize.transaction(async (t1) => {
        const job = await claimDueJob(new Date(), t1);
        await new Promise((r) => setTimeout(r, 150));
        return job?.id ?? null;
      }),
      sequelize.transaction(async (t2) => {
        await new Promise((r) => setTimeout(r, 50));
        const job = await claimDueJob(new Date(), t2);
        return job?.id ?? null;
      }),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("returns null when the only due job is already locked by another worker", async () => {
    const { gameId } = await setupStartedGame();
    await clearJobs(gameId);
    const past = new Date(Date.now() - 60 * 1000);
    const only = await insertJob(gameId, { runAt: past });

    const [holder, other] = await Promise.all([
      sequelize.transaction(async (t1) => {
        const job = await claimDueJob(new Date(), t1);
        await new Promise((r) => setTimeout(r, 150));
        return job?.id ?? null;
      }),
      sequelize.transaction(async (t2) => {
        await new Promise((r) => setTimeout(r, 50));
        return claimDueJob(new Date(), t2);
      }),
    ]);

    expect(holder).toBe(only.id);
    expect(other).toBeNull();
  });
});
