import type {
  SchedulerJobHandler,
  SchedulerJobHandlerContext,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Announce that an addressable slot index has crossed its map-reveal
 * timer (Phase L §3.13). Distinct from `SLOT_UNLOCKED` (engine-claim +
 * station-side reveal); the two timers are decoupled per
 * `games.slot_map_unlock_offsets_seconds`.
 *
 * Pure event emitter: the actual "is this slot map-visible now?" check
 * is wall-clock-based against the snapshot column, not "did the job
 * fire yet?". The job exists so map-reveal moments land in the event
 * log + are broadcast to clients, even if the projection rule itself is
 * independent of scheduler latency.
 *
 * The handler is therefore safe to retry, fail, or run late — none of
 * those affect whether a tile shows on the map. They do affect whether
 * subscribers see the announcement.
 */
export const slotMapUnlockedHandler: SchedulerJobHandler = {
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
      // Slot 0 is always immediately on-map (column-level invariant), so
      // we never seed a SLOT_MAP_UNLOCKED job for it; a slotIndex of 0
      // here is therefore a payload bug worth surfacing rather than
      // silently absorbing.
      throw new Error(
        `SLOT_MAP_UNLOCKED requires an integer slotIndex >= 1, got ${String(slotIndex)}`,
      );
    }
    if (slotIndex >= game.slotsPerNode) {
      throw new Error(
        `SLOT_MAP_UNLOCKED slotIndex ${slotIndex} is out of range for slotsPerNode ${game.slotsPerNode}`,
      );
    }

    return {
      events: [
        {
          eventType: "SLOT_MAP_UNLOCKED",
          payload: { slotIndex },
        },
      ],
    };
  },
};
