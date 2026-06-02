import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";

/**
 * Check the issuing team out of its current station. Requires the team to be
 * checked in. Emits a CHECK_OUT event with the station they left.
 */
export const checkOutHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
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

    if (position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team is not currently checked in at any station",
      );
    }

    const previousNodeId = position.currentGameNodeId;
    const previousNode = await GameNode.findOne({
      where: { id: previousNodeId, gameId: ctx.gameId },
      transaction: ctx.transaction,
    });

    position.currentGameNodeId = null;
    position.checkedInAt = null;
    // Phase F: clear the most-recent-check-in geo snapshot so SWAP_TILE
    // (which inherits these values) can't reference stale coordinates from
    // a station the team has already left.
    position.lastCheckInLatitude = null;
    position.lastCheckInLongitude = null;
    position.geofenceValidated = null;
    position.geolocationWarning = null;
    await position.save({ transaction: ctx.transaction });

    return {
      events: [
        {
          eventType: "CHECK_OUT",
          payload: {
            nodeId: previousNodeId,
            nodeCode: previousNode?.code ?? null,
            implicit: false,
          },
        },
      ],
    };
  },
};
