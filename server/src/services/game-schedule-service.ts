import type { Transaction } from "sequelize";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";

const VISIBILITY_PHASE_ADVANCE_COUNT = 3;

export async function scheduleGameJobs(
  gameId: string,
  startedAt: Date,
  endsAt: Date,
  visibilityPhaseIntervalSeconds: number,
  transaction: Transaction,
): Promise<void> {
  const intervalMs = visibilityPhaseIntervalSeconds * 1000;

  const jobs: Array<{
    gameId: string;
    jobType: "VISIBILITY_PHASE_ADVANCE" | "GAME_END";
    runAt: Date;
    status: "pending";
    payload: { targetPhase: number } | null;
  }> = [];

  for (let k = 1; k <= VISIBILITY_PHASE_ADVANCE_COUNT; k += 1) {
    jobs.push({
      gameId,
      jobType: "VISIBILITY_PHASE_ADVANCE",
      runAt: new Date(startedAt.getTime() + intervalMs * k),
      status: "pending",
      payload: { targetPhase: k },
    });
  }

  jobs.push({
    gameId,
    jobType: "GAME_END",
    runAt: endsAt,
    status: "pending",
    payload: null,
  });

  await GameScheduledJob.bulkCreate(jobs, { transaction });
}
