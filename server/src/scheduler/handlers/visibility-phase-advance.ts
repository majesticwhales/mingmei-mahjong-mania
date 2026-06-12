import { revealPhaseVisibilityGroup } from "../../services/game-visibility-reveal.ts";
import type {
  SchedulerJobHandler,
  SchedulerJobHandlerContext,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Apply a single visibility phase advance scheduled at game start.
 *
 * Enforces strict monotonic ordering: a job for `targetPhase = k` only runs
 * when `game.visibility_phase === k - 1`. Out-of-order or out-of-range
 * targets terminate the job as `failed` so an operator can investigate
 * (rather than silently skipping or double-advancing).
 *
 * `visibility_phase_count` is the snapshot count of groups; valid target
 * phases are `1 .. N - 1` (phase 0 is the initial state set at game start).
 */
export const visibilityPhaseAdvanceHandler: SchedulerJobHandler = {
  async handle(
    ctx: SchedulerJobHandlerContext,
  ): Promise<SchedulerJobHandlerOutcome> {
    const { job, game, transaction } = ctx;
    const payload = job.payload ?? {};
    const targetPhase = (payload as { targetPhase?: unknown }).targetPhase;

    if (
      typeof targetPhase !== "number" ||
      !Number.isInteger(targetPhase) ||
      targetPhase < 1
    ) {
      throw new Error(
        `VISIBILITY_PHASE_ADVANCE requires an integer targetPhase >= 1, got ${String(targetPhase)}`,
      );
    }
    if (targetPhase >= game.visibilityPhaseCount) {
      throw new Error(
        `VISIBILITY_PHASE_ADVANCE targetPhase ${targetPhase} is out of range for visibilityPhaseCount ${game.visibilityPhaseCount}`,
      );
    }
    if (targetPhase !== game.visibilityPhase + 1) {
      throw new Error(
        `VISIBILITY_PHASE_ADVANCE out of order: expected target ${game.visibilityPhase + 1}, got ${targetPhase}`,
      );
    }

    const previousPhase = game.visibilityPhase;
    game.visibilityPhase = targetPhase;
    await game.save({ transaction });

    await revealPhaseVisibilityGroup(
      game.id,
      targetPhase,
      game.visibilityPhaseCount,
      ctx.now,
      transaction,
    );

    return {
      events: [
        {
          eventType: "VISIBILITY_PHASE_ADVANCED",
          payload: {
            previousPhase,
            phase: targetPhase,
            visibilityPhaseCount: game.visibilityPhaseCount,
          },
        },
      ],
    };
  },
};
