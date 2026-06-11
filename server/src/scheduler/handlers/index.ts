import type { ScheduledJobType } from "../../models/game-scheduled-job.ts";
import type {
  SchedulerJobHandler,
  SchedulerJobHandlerRegistry,
} from "../job-handler.ts";
import { gameEndHandler } from "./game-end.ts";
import { notificationHandler } from "./notification.ts";
import { slotMapUnlockedHandler } from "./slot-map-unlocked.ts";
import { slotUnlockedHandler } from "./slot-unlocked.ts";
import { visibilityPhaseAdvanceHandler } from "./visibility-phase-advance.ts";

/**
 * Built-in scheduler job handlers. `runSchedulerTick` dispatches against
 * this registry by default; tests may pass their own.
 */
export const builtinSchedulerHandlers: SchedulerJobHandlerRegistry =
  new Map<ScheduledJobType, SchedulerJobHandler>([
    ["VISIBILITY_PHASE_ADVANCE", visibilityPhaseAdvanceHandler],
    ["GAME_END", gameEndHandler],
    ["NOTIFICATION", notificationHandler],
    ["SLOT_UNLOCKED", slotUnlockedHandler],
    ["SLOT_MAP_UNLOCKED", slotMapUnlockedHandler],
  ]);
