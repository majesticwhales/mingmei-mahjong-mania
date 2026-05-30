import type {
  SchedulerJobHandler,
  SchedulerJobHandlerContext,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Announce that an addressable slot index is now unlocked for swap.
 *
 * Pure event emitter: the actual "is this slot swap-eligible?" check is
 * wall-clock-based (`now >= game.startedAt + game.slotUnlockOffsetsSeconds[k] * 1000`),
 * not "did the job fire yet?". The job exists so unlock moments land in the
 * event log + are broadcast to clients (TDD §3.4 / chunk 4), even if the
 * gameplay rule itself is independent of scheduler latency.
 *
 * The handler is therefore safe to retry, fail, or run late — none of those
 * affect whether a swap is permitted. They do affect whether subscribers
 * see the announcement.
 */
export const slotUnlockedHandler: SchedulerJobHandler = {
  async handle(
    ctx: SchedulerJobHandlerContext,
  ): Promise<SchedulerJobHandlerOutcome> {
    const { job, game } = ctx;
    const payload = job.payload ?? {};
    const slotIndex = (payload as { slotIndex?: unknown }).slotIndex;

    if (
      typeof slotIndex !== "number" ||
      !Number.isInteger(slotIndex) ||
      slotIndex < 1
    ) {
      // Slot 0 is always unlocked at game start, so we never seed a
      // SLOT_UNLOCKED job for it; a slotIndex of 0 here is therefore a
      // payload bug worth surfacing rather than silently absorbing.
      throw new Error(
        `SLOT_UNLOCKED requires an integer slotIndex >= 1, got ${String(slotIndex)}`,
      );
    }
    if (slotIndex >= game.slotsPerNode) {
      throw new Error(
        `SLOT_UNLOCKED slotIndex ${slotIndex} is out of range for slotsPerNode ${game.slotsPerNode}`,
      );
    }

    return {
      events: [
        {
          eventType: "SLOT_UNLOCKED",
          payload: { slotIndex },
        },
      ],
    };
  },
};
