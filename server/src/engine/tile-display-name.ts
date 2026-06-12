import type { Transaction } from "sequelize";
import { GameTile } from "../models/game-tile.ts";
import { TileType } from "../models/tile-type.ts";

export async function displayNamesForGameTiles(
  tileIds: string[],
  transaction: Transaction,
): Promise<Map<string, string>> {
  if (tileIds.length === 0) return new Map();

  const tiles = await GameTile.findAll({
    where: { id: tileIds },
    include: [TileType],
    transaction,
  });

  const names = new Map<string, string>();
  for (const tile of tiles) {
    const displayName = tile.tileType?.displayName;
    if (displayName) {
      names.set(tile.id, displayName);
    }
  }
  return names;
}
