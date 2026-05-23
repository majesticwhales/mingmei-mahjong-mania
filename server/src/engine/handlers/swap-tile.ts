import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { GameTilePlacement } from "../../models/game-tile-placement.ts";
import { swapPlacements } from "../tile-swap-service.ts";

interface SwapTilePayload {
  /** `game_tiles.id` of a tile currently in the issuing team's hand. */
  tileId: string;
}

function parsePayload(payload: Record<string, unknown>): SwapTilePayload {
  const tileId = payload.tileId;
  if (typeof tileId !== "string" || tileId.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      "SWAP_TILE requires a string tileId in the payload",
    );
  }
  return { tileId };
}

/**
 * Exchange one of the team's hand tiles with the tile currently at the
 * team's checked-in station. Requires the team to be at a station per
 * TDD §3.3 `canSwap`. The station tile is server-determined (the unique
 * placement at `position.current_game_node_id`); the client only chooses
 * which hand tile to give up.
 */
export const swapTileHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { tileId: handTileId } = parsePayload(ctx.payload);

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position || position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team must be checked in at a station to swap tiles",
      );
    }

    const handPlacement = await GameTilePlacement.findOne({
      where: { gameTileId: handTileId },
      transaction: ctx.transaction,
    });
    if (!handPlacement || handPlacement.gameTeamId !== ctx.gameTeamId) {
      throw new HttpError(
        400,
        "tile_not_in_hand",
        `Tile ${handTileId} is not in this team's hand`,
      );
    }

    const stationPlacement = await GameTilePlacement.findOne({
      where: { gameNodeId: position.currentGameNodeId },
      transaction: ctx.transaction,
    });
    if (!stationPlacement) {
      throw new HttpError(
        500,
        "internal_error",
        `No tile placement at station ${position.currentGameNodeId}`,
      );
    }

    const station = await GameNode.findByPk(position.currentGameNodeId, {
      transaction: ctx.transaction,
    });
    if (!station) {
      throw new HttpError(
        500,
        "internal_error",
        `Station ${position.currentGameNodeId} not found`,
      );
    }

    await swapPlacements(
      ctx.transaction,
      handPlacement.gameTileId,
      stationPlacement.gameTileId,
    );

    return {
      events: [
        {
          eventType: "SWAP_TILE",
          payload: {
            nodeId: station.id,
            nodeCode: station.code,
            handTileId: handPlacement.gameTileId,
            nodeTileId: stationPlacement.gameTileId,
          },
        },
      ],
    };
  },
};
