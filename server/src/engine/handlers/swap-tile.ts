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
  handTileId: string;
  /**
   * `game_tiles.id` of the specific tile at the team's current station to
   * receive in exchange. Required because a station may hold up to
   * `games.slots_per_node` tiles; the caller picks which one to take.
   */
  stationTileId: string;
}

function parseTileId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      `SWAP_TILE requires a string ${fieldName} in the payload`,
    );
  }
  return value;
}

function parsePayload(payload: Record<string, unknown>): SwapTilePayload {
  const handTileId = parseTileId(payload.handTileId, "handTileId");
  const stationTileId = parseTileId(payload.stationTileId, "stationTileId");
  if (handTileId === stationTileId) {
    throw new HttpError(
      400,
      "invalid_payload",
      "handTileId and stationTileId must reference different tiles",
    );
  }
  return { handTileId, stationTileId };
}

/**
 * Exchange one of the team's hand tiles with one of the tiles at the team's
 * checked-in station. Requires the team to be at a station per TDD §3.3
 * `canSwap`. Both tiles are caller-chosen: with `games.slots_per_node > 1`
 * a station may hold multiple tiles and the server cannot disambiguate.
 */
export const swapTileHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { handTileId, stationTileId } = parsePayload(ctx.payload);

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

    const placements = await GameTilePlacement.findAll({
      where: { gameTileId: [handTileId, stationTileId] },
      transaction: ctx.transaction,
    });
    const handPlacement = placements.find(
      (p) => p.gameTileId === handTileId,
    );
    const stationPlacement = placements.find(
      (p) => p.gameTileId === stationTileId,
    );

    if (!handPlacement || handPlacement.gameTeamId !== ctx.gameTeamId) {
      throw new HttpError(
        400,
        "tile_not_in_hand",
        `Tile ${handTileId} is not in this team's hand`,
      );
    }
    if (
      !stationPlacement ||
      stationPlacement.gameNodeId !== position.currentGameNodeId
    ) {
      throw new HttpError(
        400,
        "tile_not_at_station",
        `Tile ${stationTileId} is not at the team's current station`,
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
            stationTileId: stationPlacement.gameTileId,
          },
        },
      ],
    };
  },
};
