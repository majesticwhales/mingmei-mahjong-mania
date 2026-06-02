import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import {
  evaluateGeolocation,
  parseGeoPayload,
  type GeoInput,
} from "../../services/geolocation.ts";

interface CheckInPayload {
  nodeId: string;
  geo: GeoInput | null;
}

function parsePayload(payload: Record<string, unknown>): CheckInPayload {
  const nodeId = payload.nodeId;
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CHECK_IN requires a string nodeId in the payload",
    );
  }
  const geo = parseGeoPayload(payload.geo);
  return { nodeId, geo };
}

/**
 * Check the issuing team in at a station.
 *
 * Per TDD §3.4 "Check-in elsewhere": if the team is already checked in at a
 * different station, the handler first emits an implicit CHECK_OUT event for
 * the previous station, then the CHECK_IN event for the new one. The single
 * underlying position update only writes the new node.
 *
 * Phase F (this handler): the optional `geo` payload is parsed and evaluated
 * against the target station's geofence + accuracy. Results are persisted
 * into `game_team_positions` (last-known lat/lng/validated/warning columns)
 * and lifted onto the CHECK_IN event payload so the event log can render a
 * warning badge. The handler **never rejects** on a geo warning — per TDD
 * §3.4 the rule is "allow always, warn".
 *
 * Phase G (deferred): media (photo) fields on the payload are still ignored.
 */
export const checkInHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { nodeId: targetNodeId, geo } = parsePayload(ctx.payload);

    const targetNode = await GameNode.findOne({
      where: { id: targetNodeId, gameId: ctx.gameId },
      transaction: ctx.transaction,
    });
    if (!targetNode) {
      throw new HttpError(
        404,
        "node_not_in_game",
        `Station ${targetNodeId} is not on this game's map`,
      );
    }

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing position row for team ${ctx.gameTeamId}`,
      );
    }

    if (position.currentGameNodeId === targetNode.id) {
      throw new HttpError(
        409,
        "already_at_node",
        `Team is already checked in at ${targetNode.code}`,
      );
    }

    const evaluation = geo != null ? evaluateGeolocation(geo, targetNode) : null;

    const events: CommandResult["events"] = [];

    if (position.currentGameNodeId != null) {
      const previousNode = await GameNode.findOne({
        where: { id: position.currentGameNodeId, gameId: ctx.gameId },
        transaction: ctx.transaction,
      });
      events.push({
        eventType: "CHECK_OUT",
        payload: {
          nodeId: position.currentGameNodeId,
          nodeCode: previousNode?.code ?? null,
          implicit: true,
        },
      });
    }

    position.currentGameNodeId = targetNode.id;
    position.checkedInAt = new Date();
    position.lastCheckInLatitude = geo?.latitude ?? null;
    position.lastCheckInLongitude = geo?.longitude ?? null;
    position.geofenceValidated = evaluation?.validated ?? null;
    position.geolocationWarning = evaluation?.warning ?? null;
    await position.save({ transaction: ctx.transaction });

    const checkInPayload: Record<string, unknown> = {
      nodeId: targetNode.id,
      nodeCode: targetNode.code,
    };
    if (evaluation != null) {
      checkInPayload.geolocationWarning = evaluation.warning;
      checkInPayload.geofenceValidated = evaluation.validated;
      checkInPayload.distanceMeters = evaluation.distanceMeters;
    }

    events.push({
      eventType: "CHECK_IN",
      payload: checkInPayload,
    });

    return { events };
  },
};
