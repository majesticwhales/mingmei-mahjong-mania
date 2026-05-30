import type {
  SchedulerJobHandler,
  SchedulerJobHandlerContext,
  SchedulerJobHandlerOutcome,
} from "../job-handler.ts";

/**
 * Fan out a scheduled global notification.
 *
 * Records a `NOTIFICATION` event in the game's event log (so summaries can
 * reproduce the timeline) and queues a broadcaster `emitNotification` for
 * post-commit fan-out to subscribed clients. No game state mutates.
 *
 * The job payload is the original `lobby_notifications` row content copied
 * by `scheduleGameJobs`: `{ template, data }`. `data` may be `null` or an
 * object; the template catalog is a rule-layer concern.
 */
export const notificationHandler: SchedulerJobHandler = {
  async handle(
    ctx: SchedulerJobHandlerContext,
  ): Promise<SchedulerJobHandlerOutcome> {
    const { job } = ctx;
    const payload = (job.payload ?? {}) as {
      template?: unknown;
      data?: unknown;
    };
    const template = payload.template;
    if (typeof template !== "string" || template.length === 0) {
      throw new Error("NOTIFICATION job is missing a string template");
    }

    let data: Record<string, unknown> | null = null;
    if (payload.data === null || payload.data === undefined) {
      data = null;
    } else if (
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
    ) {
      data = payload.data as Record<string, unknown>;
    } else {
      throw new Error(
        "NOTIFICATION job payload.data must be an object or null",
      );
    }

    return {
      events: [
        {
          eventType: "NOTIFICATION",
          payload: { template, data },
        },
      ],
      notifications: [
        data == null ? { template } : { template, data },
      ],
    };
  },
};
