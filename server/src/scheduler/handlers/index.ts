import type { ScheduledJobType } from "../../models/game-scheduled-job.ts";
import type {
  SchedulerJobHandler,
  SchedulerJobHandlerRegistry,
} from "../job-handler.ts";

/**
 * Built-in scheduler job handlers.
 *
 * Empty for chunk 1 of the Phase D scheduler buildout — `runSchedulerTick`
 * dispatches to whichever registry the caller supplies, and chunk 2 will
 * populate this default registry with the `VISIBILITY_PHASE_ADVANCE`,
 * `GAME_END`, and `NOTIFICATION` handlers. Tests that exercise the
 * orchestrator before chunk 2 lands pass their own registry.
 */
export const builtinSchedulerHandlers: SchedulerJobHandlerRegistry =
  new Map<ScheduledJobType, SchedulerJobHandler>();
