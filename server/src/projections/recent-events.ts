import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.ts";
import type { GameEvent } from "../models/game-event.ts";

/**
 * Compact event shape sent to clients in `game.state.recentEvents` **and**
 * on the live `game.event` socket channel — both use the exact same wire
 * shape so the client can append a real-time event to its `recentEvents`
 * list without massaging the payload.
 *
 * We lift a small whitelist of payload fields to the top level so the
 * client can render rich activity entries without parsing free-form
 * payloads or being exposed to media URLs / internal ids.
 */
export interface RecentEventDto {
  /** Server-assigned monotonic event sequence. */
  sequence: number;
  /** Event type code (`CHECK_IN`, `SWAP_TILE`, `SLOT_UNLOCKED`, …). */
  type: string;
  /** Team code of the acting team, or `null` for scheduler-emitted events. */
  teamCode: string | null;
  /** ISO timestamp the event was recorded server-side. */
  at: string;
  nodeCode?: string;
  slotIndex?: number;
  hasPhoto?: boolean;
  phase?: number;
  template?: string;
}

const DEFAULT_LIMIT = 50;

interface Row {
  sequence: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
  team_code: string | null;
}

/**
 * Return the most recent `limit` events for a game, ordered by sequence
 * ascending so a client can append-only-extend its local history. Joins
 * through `game_teams` → `team_definitions` to translate `actor_game_team_id`
 * into a stable team code; events with no actor (scheduler-emitted) come
 * back with `teamCode: null`.
 *
 * Pure read; intended for use from the projection and not as part of any
 * command-handling transaction.
 */
export async function selectRecentEvents(
  gameId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<RecentEventDto[]> {
  const safeLimit =
    Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;

  const rows = await sequelize.query<Row>(
    `WITH recent AS (
       SELECT e.sequence,
              e.event_type,
              e.payload,
              e.created_at,
              e.actor_game_team_id
       FROM game_events e
       WHERE e.game_id = :gameId
       ORDER BY e.sequence DESC
       LIMIT :limit
     )
     SELECT r.sequence,
            r.event_type,
            r.payload,
            r.created_at,
            td.code AS team_code
     FROM recent r
     LEFT JOIN game_teams gt ON gt.id = r.actor_game_team_id
     LEFT JOIN team_definitions td ON td.id = gt.team_definition_id
     ORDER BY r.sequence ASC`,
    {
      replacements: { gameId, limit: safeLimit },
      type: QueryTypes.SELECT,
    },
  );

  return rows.map(rowToDto);
}

/**
 * Build the same wire DTO from a single freshly-appended `GameEvent`
 * model instance. Used by the SocketBroadcaster's `emitEvent` path so
 * the live `game.event` channel matches `game.state.recentEvents[]`
 * exactly. Issues a single small JOIN to resolve `team_code` when the
 * event has an actor; scheduler-emitted events return `teamCode: null`.
 */
export async function serializeGameEvent(
  event: GameEvent,
): Promise<RecentEventDto> {
  let teamCode: string | null = null;
  if (event.actorGameTeamId != null) {
    const rows = await sequelize.query<{ code: string | null }>(
      `SELECT td.code
       FROM game_teams gt
       INNER JOIN team_definitions td ON td.id = gt.team_definition_id
       WHERE gt.id = :id`,
      { replacements: { id: event.actorGameTeamId }, type: QueryTypes.SELECT },
    );
    teamCode = rows[0]?.code ?? null;
  }
  return rowToDto({
    sequence: String(event.sequence),
    event_type: event.eventType,
    payload: event.payload ?? null,
    created_at: event.createdAt,
    team_code: teamCode,
  });
}

function rowToDto(row: Row): RecentEventDto {
  const dto: RecentEventDto = {
    sequence: Number(row.sequence),
    type: row.event_type,
    teamCode: row.team_code,
    at: row.created_at.toISOString(),
  };
  const payload = row.payload ?? {};
  const nodeCode = payload.nodeCode;
  if (typeof nodeCode === "string") {
    dto.nodeCode = nodeCode;
  }
  const slotIndex = payload.slotIndex;
  if (typeof slotIndex === "number" && Number.isInteger(slotIndex)) {
    dto.slotIndex = slotIndex;
  }
  const hasPhoto = payload.hasPhoto;
  if (typeof hasPhoto === "boolean") {
    dto.hasPhoto = hasPhoto;
  }
  const phase = payload.phase;
  if (typeof phase === "number" && Number.isInteger(phase)) {
    dto.phase = phase;
  }
  const template = payload.template;
  if (typeof template === "string") {
    dto.template = template;
  }
  return dto;
}
