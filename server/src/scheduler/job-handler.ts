import type { Transaction } from "sequelize";
import type { NotificationPayload } from "../engine/broadcaster.ts";
import type { EmittedEvent } from "../engine/process-command.ts";
import type { Game } from "../models/game.ts";
import type {
  GameScheduledJob,
  ScheduledJobType,
} from "../models/game-scheduled-job.ts";

/**
 * Context a scheduler job handler receives. Handlers run inside the
 * orchestrator's transaction; the row has already been claimed
 * (`status = 'processing'`) and the parent `game` row pre-loaded.
 */
export interface SchedulerJobHandlerContext {
  job: GameScheduledJob;
  game: Game;
  transaction: Transaction;
  now: Date;
}

/**
 * What a scheduler handler produces. Events are appended to `game_events` by
 * the orchestrator (so all handlers share consistent sequence/actor logic);
 * notifications are passed to `Broadcaster.emitNotification` after the
 * transaction commits.
 *
 * `system` actor: scheduler jobs are not initiated by a user, so events
 * appended on their behalf carry `actor_user_id = NULL` and
 * `actor_game_team_id = NULL`.
 */
export interface SchedulerJobHandlerOutcome {
  events?: EmittedEvent[];
  notifications?: NotificationPayload[];
}

export interface SchedulerJobHandler {
  handle(
    ctx: SchedulerJobHandlerContext,
  ): Promise<SchedulerJobHandlerOutcome>;
}

export type SchedulerJobHandlerRegistry = ReadonlyMap<
  ScheduledJobType,
  SchedulerJobHandler
>;
