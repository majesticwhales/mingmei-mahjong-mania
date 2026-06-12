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
  /** Human-readable station name, lifted from event payloads when present. */
  nodeName?: string;
  slotIndex?: number;
  handTileDisplayName?: string;
  stationTileDisplayName?: string;
  hasPhoto?: boolean;
  /**
   * Phase F: present on CHECK_IN events whose command payload included a
   * `geo` field. Truthy means the check-in was outside the station's
   * geofence and/or the reported accuracy exceeded the geofence radius.
   * The full `distanceMeters` / `geofenceValidated` fields remain in
   * `game_events.payload` for audit but are not lifted here — the client
   * only needs the boolean for the warning badge.
   */
  geolocationWarning?: boolean;
  phase?: number;
  /** Lifted from visibility phase advance events (`games.visibility_phase_count`). */
  visibilityPhaseCount?: number;
  template?: string;
  /**
   * Phase H: lifted on START_CHALLENGE / CHALLENGE_COMPLETED /
   * CHALLENGE_FORFEITED events. `challengeId` is the catalog id
   * (stable across games), `instanceId` is the per-team
   * `game_challenge_instances.id` (stable within a game). The client
   * needs both to render activity items and to reference the right
   * row in follow-up commands.
   */
  challengeId?: string;
  instanceId?: string;
  /**
   * Phase J: lifted on `CLAIM_WIN` events only, and only on the
   * **claiming team's** projection (`selectRecentEvents` strips the
   * field from rows whose `actor_game_team_id` doesn't match the
   * requesting team). Other teams see the `CLAIM_WIN` row but without
   * the score — the full breakdown lands in the per-team `handCompleted`
   * DTO and at game end via `GET /api/games/:id/summary`.
   *
   * The live `game.event` socket channel never carries `finalPoints` at
   * all (`serializeGameEvent` does not lift the field) so a non-claiming
   * team's projection refresh isn't a vehicle for leaking points
   * between the redaction-aware `recentEvents[]` snapshots.
   */
  finalPoints?: number;
}

const DEFAULT_LIMIT = 50;

interface Row {
  sequence: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
  team_code: string | null;
  actor_game_team_id: string | null;
}

export interface SelectRecentEventsOptions {
  limit?: number;
  /**
   * Phase J: requesting team scope for per-team payload redaction. When
   * provided, `CLAIM_WIN` rows whose `actor_game_team_id` differs from
   * `requestingGameTeamId` have `finalPoints` stripped from the DTO.
   * Other CLAIM_WIN fields (`nodeCode`, `slotIndex`) are public and
   * still lifted. Pass `null` (or omit) to skip the lift entirely (e.g.
   * `serializeGameEvent`, which broadcasts to all teams at once).
   */
  requestingGameTeamId?: string | null;
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
 *
 * `options.requestingGameTeamId` enables per-team redaction on `CLAIM_WIN`
 * rows: only the claiming team's projection has `finalPoints` populated.
 */
export async function selectRecentEvents(
  gameId: string,
  options: SelectRecentEventsOptions = {},
): Promise<RecentEventDto[]> {
  const { limit = DEFAULT_LIMIT, requestingGameTeamId = null } = options;
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
            r.actor_game_team_id,
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

  return rows.map((row) => rowToDto(row, requestingGameTeamId));
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
  // `serializeGameEvent` fans out to every socket in the game room,
  // so we deliberately pass `requestingGameTeamId: null`. The
  // resulting DTO never carries `finalPoints` — only the per-team
  // projection's `recentEvents[]` exposes it to the claiming team.
  return rowToDto(
    {
      sequence: String(event.sequence),
      event_type: event.eventType,
      payload: event.payload ?? null,
      created_at: event.createdAt,
      team_code: teamCode,
      actor_game_team_id: event.actorGameTeamId ?? null,
    },
    null,
  );
}

function rowToDto(row: Row, requestingGameTeamId: string | null): RecentEventDto {
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
  const nodeName = payload.nodeName;
  if (typeof nodeName === "string") {
    dto.nodeName = nodeName;
  }
  const handTileDisplayName = payload.handTileDisplayName;
  if (typeof handTileDisplayName === "string") {
    dto.handTileDisplayName = handTileDisplayName;
  }
  const stationTileDisplayName = payload.stationTileDisplayName;
  if (typeof stationTileDisplayName === "string") {
    dto.stationTileDisplayName = stationTileDisplayName;
  }
  const slotIndex = payload.slotIndex;
  if (typeof slotIndex === "number" && Number.isInteger(slotIndex)) {
    dto.slotIndex = slotIndex;
  }
  const hasPhoto = payload.hasPhoto;
  if (typeof hasPhoto === "boolean") {
    dto.hasPhoto = hasPhoto;
  }
  const geolocationWarning = payload.geolocationWarning;
  if (typeof geolocationWarning === "boolean") {
    dto.geolocationWarning = geolocationWarning;
  }
  const phase = payload.phase;
  if (typeof phase === "number" && Number.isInteger(phase)) {
    dto.phase = phase;
  }
  const visibilityPhaseCount = payload.visibilityPhaseCount;
  if (
    typeof visibilityPhaseCount === "number" &&
    Number.isInteger(visibilityPhaseCount)
  ) {
    dto.visibilityPhaseCount = visibilityPhaseCount;
  }
  const template = payload.template;
  if (typeof template === "string") {
    dto.template = template;
  }
  const challengeId = payload.challengeId;
  if (typeof challengeId === "string") {
    dto.challengeId = challengeId;
  }
  const instanceId = payload.instanceId;
  if (typeof instanceId === "string") {
    dto.instanceId = instanceId;
  }
  // Phase J: lift `finalPoints` on CLAIM_WIN rows only for the
  // claiming team. Other teams' projections (and the public live
  // `game.event` channel) see the row without the score.
  if (
    row.event_type === "CLAIM_WIN" &&
    requestingGameTeamId != null &&
    row.actor_game_team_id != null &&
    row.actor_game_team_id === requestingGameTeamId
  ) {
    const finalPoints = payload.finalPoints;
    if (typeof finalPoints === "number" && Number.isFinite(finalPoints)) {
      dto.finalPoints = finalPoints;
    }
  }
  return dto;
}
