import type { Transaction } from "sequelize";
import { HttpError } from "../lib/http-error.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";
import { MapTemplateNodeChallenge } from "../models/map-template-node-challenge.ts";

/**
 * Snapshot the map template's per-node challenge queue into per-game
 * rows. Called from `startFromLobby` after `cloneMapTemplateToGame` has
 * built the `template_node_id -> game_node_id` mapping.
 *
 * Empty templates (no `map_template_node_challenges` rows) are a no-op;
 * the engine's swap-credit gate bypasses nodes with zero
 * `game_node_challenges`, so legacy templates keep working unchanged.
 *
 * Returns the number of rows copied (mostly useful for tests and logs).
 */
export async function bootstrapGameChallenges(
  mapTemplateNodeIds: ReadonlyArray<string>,
  gameNodeIdByTemplateNodeId: ReadonlyMap<string, string>,
  transaction: Transaction,
): Promise<number> {
  if (mapTemplateNodeIds.length === 0) {
    return 0;
  }

  const queueRows = await MapTemplateNodeChallenge.findAll({
    where: { mapTemplateNodeId: [...mapTemplateNodeIds] },
    order: [
      ["mapTemplateNodeId", "ASC"],
      ["sortOrder", "ASC"],
    ],
    transaction,
  });

  if (queueRows.length === 0) {
    return 0;
  }

  const payload = queueRows.map((row) => {
    const gameNodeId = gameNodeIdByTemplateNodeId.get(row.mapTemplateNodeId);
    if (!gameNodeId) {
      throw new HttpError(
        500,
        "internal_error",
        `Missing cloned game node for template node ${row.mapTemplateNodeId} while copying challenge queue`,
      );
    }
    return {
      gameNodeId,
      challengeId: row.challengeId,
      sortOrder: row.sortOrder,
    };
  });

  await GameNodeChallenge.bulkCreate(payload, { transaction });
  return payload.length;
}
