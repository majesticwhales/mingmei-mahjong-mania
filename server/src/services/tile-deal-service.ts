import type { Transaction } from "sequelize";
import { EXPECTED_MAP_NODE_COUNT } from "../game/visibility-groups.ts";
import { HttpError } from "../lib/http-error.ts";
import { shuffleInPlace } from "../lib/shuffle.ts";
import { GameNode } from "../models/game-node.ts";
import { GameTile } from "../models/game-tile.ts";
import { GameTilePlacement } from "../models/game-tile-placement.ts";
import { TileType } from "../models/tile-type.ts";
import {
  GAME_TEAM_SLOTS,
  type GameTeamSlot,
} from "./even-team-assignment.ts";

const EXPECTED_TILE_COUNT = 136;
const HAND_SIZE = 13;

export async function dealTilesForGame(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  transaction: Transaction,
): Promise<void> {
  const tileTypes = await TileType.findAll({ transaction });
  if (tileTypes.length !== EXPECTED_TILE_COUNT) {
    throw new HttpError(
      500,
      "internal_error",
      `Expected ${EXPECTED_TILE_COUNT} tile types in catalog, got ${tileTypes.length}`,
    );
  }

  const nodes = await GameNode.findAll({
    where: { gameId },
    order: [["code", "ASC"]],
    attributes: ["id"],
    transaction,
  });
  if (nodes.length !== EXPECTED_MAP_NODE_COUNT) {
    throw new HttpError(
      500,
      "internal_error",
      `Expected ${EXPECTED_MAP_NODE_COUNT} game nodes, got ${nodes.length}`,
    );
  }

  const gameTiles = await GameTile.bulkCreate(
    tileTypes.map((tileType) => ({
      gameId,
      tileTypeId: tileType.id,
      copyIndex: tileType.copyIndex,
    })),
    { transaction, returning: true },
  );

  const shuffledTileIds = gameTiles.map((tile) => tile.id);
  shuffleInPlace(shuffledTileIds);

  const placements: Array<{
    gameTileId: string;
    gameNodeId: string | null;
    gameTeamId: string | null;
  }> = [];

  for (let i = 0; i < nodes.length; i += 1) {
    placements.push({
      gameTileId: shuffledTileIds[i]!,
      gameNodeId: nodes[i]!.id,
      gameTeamId: null,
    });
  }

  let offset = nodes.length;
  for (const slot of GAME_TEAM_SLOTS) {
    const gameTeamId = gameTeamIdBySlot.get(slot);
    if (!gameTeamId) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing game team for slot ${slot}`,
      );
    }
    for (let h = 0; h < HAND_SIZE; h += 1) {
      placements.push({
        gameTileId: shuffledTileIds[offset]!,
        gameNodeId: null,
        gameTeamId,
      });
      offset += 1;
    }
  }

  if (offset !== shuffledTileIds.length) {
    throw new HttpError(
      500,
      "internal_error",
      `Tile deal placement count mismatch (expected ${shuffledTileIds.length}, placed ${offset})`,
    );
  }

  await GameTilePlacement.bulkCreate(placements, { transaction });
}
