import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";

interface CheckInPayload {
  nodeId: string;
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
  return { nodeId };
}

/**
 * Check the issuing team in at a station.
 *
 * Per TDD §3.4 "Check-in elsewhere": if the team is already checked in at a
 * different station, the handler first emits an implicit CHECK_OUT event for
 * the previous station, then the CHECK_IN event for the new one. The single
 * underlying position update only writes the new node.
 *
 * Phase D ignores media (photo) and geolocation fields on the payload; those
 * will be wired in Phases G and F respectively.
 */
export const checkInHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { nodeId: targetNodeId } = parsePayload(ctx.payload);

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
    await position.save({ transaction: ctx.transaction });

    events.push({
      eventType: "CHECK_IN",
      payload: {
        nodeId: targetNode.id,
        nodeCode: targetNode.code,
      },
    });

    return { events };
  },
};
