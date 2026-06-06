import type { Transaction } from "sequelize";
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

export interface DealTilesOptions {
  /**
   * Number of tiles to park in the per-game dead wall after node + hand
   * placements are filled. Defaults to `0` (no dead wall). The first
   * dead-wall tile (`dead_wall_index = 0`) becomes the dora indicator
   * consumed by the scoring module — see TDD §3.9. Dead-wall tiles never
   * move; no engine command re-targets them.
   */
  deadWallSize?: number;
}

/**
 * Deal tiles for a freshly cloned game map. The dealer:
 *
 * 1. Validates the closed-set invariant:
 *    `slotsPerNode × nodeCount + handSize × teamCount + deadWallSize
 *    === catalogSize`
 *    where `catalogSize = COUNT(*) FROM tile_types`. Both ends of the
 *    deal must consume the full shuffled catalog; any leftover tiles
 *    would silently never appear in the game, and any shortfall would
 *    leave a slot unfilled.
 * 2. Creates one `game_tiles` row per `tile_types` row.
 * 3. Fisher–Yates shuffles the tile ids.
 * 4. Places `slotsPerNode` tiles at each `game_node` (in `code` order for
 *    determinism on rerun).
 * 5. Deals `handSize` tiles into each team's hand, in `GAME_TEAM_SLOTS`
 *    order. The team count is `gameTeamIdBySlot.size`.
 * 6. Parks the remaining `deadWallSize` tiles as `dead_wall_index = 0..n-1`
 *    placements (no node, no team). Index 0 is the dora indicator.
 */
export async function dealTilesForGame(
  gameId: string,
  gameTeamIdBySlot: Map<GameTeamSlot, string>,
  slotsPerNode: number,
  handSize: number,
  transaction: Transaction,
  options: DealTilesOptions = {},
): Promise<void> {
  const deadWallSize = options.deadWallSize ?? 0;
  if (!Number.isInteger(slotsPerNode) || slotsPerNode < 1) {
    throw new HttpError(
      500,
      "internal_error",
      `slotsPerNode must be a positive integer, got ${slotsPerNode}`,
    );
  }
  if (!Number.isInteger(handSize) || handSize < 1) {
    throw new HttpError(
      500,
      "internal_error",
      `handSize must be a positive integer, got ${handSize}`,
    );
  }
  if (!Number.isInteger(deadWallSize) || deadWallSize < 0) {
    throw new HttpError(
      500,
      "internal_error",
      `deadWallSize must be a non-negative integer, got ${deadWallSize}`,
    );
  }

  const [tileTypes, nodes] = await Promise.all([
    TileType.findAll({ transaction }),
    GameNode.findAll({
      where: { gameId },
      order: [["code", "ASC"]],
      attributes: ["id"],
      transaction,
    }),
  ]);

  const catalogSize = tileTypes.length;
  const teamCount = gameTeamIdBySlot.size;
  const required =
    slotsPerNode * nodes.length + handSize * teamCount + deadWallSize;

  if (required !== catalogSize) {
    throw new HttpError(
      500,
      "internal_error",
      `Tile catalog mismatch: slotsPerNode (${slotsPerNode}) × nodes (${nodes.length}) ` +
      `+ handSize (${handSize}) × teams (${teamCount}) + deadWallSize (${deadWallSize}) = ${required}, ` +
      `but tile catalog has ${catalogSize} entries`,
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
    slotIndex: number | null;
    deadWallIndex: number | null;
  }> = [];

  let offset = 0;
  for (const node of nodes) {
    for (let s = 0; s < slotsPerNode; s += 1) {
      placements.push({
        gameTileId: shuffledTileIds[offset]!,
        gameNodeId: node.id,
        gameTeamId: null,
        slotIndex: s,
        deadWallIndex: null,
      });
      offset += 1;
    }
  }

  for (const slot of GAME_TEAM_SLOTS) {
    const gameTeamId = gameTeamIdBySlot.get(slot);
    if (!gameTeamId) {
      // Skip slots that aren't represented in this game (in case a future
      // configuration allows teamCount != GAME_TEAM_SLOTS.length).
      continue;
    }
    for (let h = 0; h < handSize; h += 1) {
      placements.push({
        gameTileId: shuffledTileIds[offset]!,
        gameNodeId: null,
        gameTeamId,
        slotIndex: null,
        deadWallIndex: null,
      });
      offset += 1;
    }
  }

  // Park remaining tiles as the dead wall. Index 0 is the dora indicator.
  for (let d = 0; d < deadWallSize; d += 1) {
    placements.push({
      gameTileId: shuffledTileIds[offset]!,
      gameNodeId: null,
      gameTeamId: null,
      slotIndex: null,
      deadWallIndex: d,
    });
    offset += 1;
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
