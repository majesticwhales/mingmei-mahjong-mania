import type { Transaction } from "sequelize";
import { TILE_STATION_CODES } from "../game/tile-stations.ts";
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
  /**
   * Which map nodes receive station tiles. Defaults to `TILE_STATION_CODES`
   * (23 designated stations). Pass `"all"` to place at every cloned node
   * (synthetic / legacy test maps).
   */
  tileStationCodes?: readonly string[] | "all";
}

/**
 * Deal tiles for a freshly cloned game map. The dealer:
 *
 * 1. Validates the closed-set invariant:
 *    `slotsPerNode × tileStationCount + handSize × teamCount + deadWallSize
 *    === catalogSize`
 *    where `tileStationCount` is the number of nodes that receive tiles
 *    (23 on the TTC map by default, not every cloned node). Both ends of
 *    the deal must consume the full shuffled catalog.
 * 2. Creates one `game_tiles` row per `tile_types` row.
 * 3. Fisher–Yates shuffles the tile ids.
 * 4. Places `slotsPerNode` tiles at each tile station (canonical code order).
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
      attributes: ["id", "code"],
      transaction,
    }),
  ]);

  const tileStationCodes =
    options.tileStationCodes === "all"
      ? null
      : (options.tileStationCodes ?? TILE_STATION_CODES);

  const dealNodes = resolveDealNodes(nodes, tileStationCodes);

  const catalogSize = tileTypes.length;
  const teamCount = gameTeamIdBySlot.size;
  const required =
    slotsPerNode * dealNodes.length + handSize * teamCount + deadWallSize;

  if (required !== catalogSize) {
    throw new HttpError(
      500,
      "internal_error",
      `Tile catalog mismatch: slotsPerNode (${slotsPerNode}) × tile stations (${dealNodes.length}) ` +
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
  for (const node of dealNodes) {
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

function resolveDealNodes(
  nodes: Array<Pick<GameNode, "id" | "code">>,
  tileStationCodes: readonly string[] | null,
): Array<Pick<GameNode, "id" | "code">> {
  if (tileStationCodes === null) {
    return nodes;
  }

  const nodeByCode = new Map(nodes.map((node) => [node.code, node]));
  const dealNodes: Array<Pick<GameNode, "id" | "code">> = [];

  for (const code of tileStationCodes) {
    const node = nodeByCode.get(code);
    if (!node) {
      throw new HttpError(
        500,
        "internal_error",
        `Tile station "${code}" is not present on game map (missing from cloned nodes)`,
      );
    }
    dealNodes.push(node);
  }

  return dealNodes;
}
