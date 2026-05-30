import type {
  SchedulerJobHandler,
  SchedulerJobHandlerContext,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Flip an active game to `ended` at its scheduled end time.
 *
 * v1 collapses the TDD §5 `active → ending → ended` lifecycle into a single
 * transition: `active → ended`. The intermediate `ending` state is reserved
 * for the queue-drain handoff once the command-queue processor lands, at
 * which point this handler will move to `ending` and the queue processor
 * will finalize to `ended`.
 *
 * Idempotent: an already-ended game returns success with no event. Any
 * other non-active status (none defined yet in v1) is rejected loudly.
 */
export const gameEndHandler: SchedulerJobHandler = {
  async handle(
    ctx: SchedulerJobHandlerContext,
  ): Promise<SchedulerJobHandlerOutcome> {
    const { game, transaction, now } = ctx;

    if (game.status === "ended") {
      return {};
    }
    if (game.status !== "active") {
      throw new Error(
        `GAME_END can only run on active games; game ${game.id} is ${game.status}`,
      );
    }

    game.status = "ended";
    await game.save({ transaction });

    return {
      events: [
        {
          eventType: "GAME_ENDED",
          payload: {
            endedAt: now.toISOString(),
          },
        },
      ],
    };
  },
};
