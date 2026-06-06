import type { Transaction } from "sequelize";
import { HttpError } from "../lib/http-error.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNode } from "../models/game-node.ts";
import { GameNodeVisibilityGroup } from "../models/game-node-visibility-group.ts";
import { GameTeamHomeGroup } from "../models/game-team-home-group.ts";

/**
 * Reveal the visibility group unlocked at `phase` for every team in the game.
 *
 * Phase 0 is seeded at game start; each advance to phase `k` reveals group
 * `(homeGroup + k) % visibilityPhaseCount` per team. Idempotent via the
 * `(game_team_id, game_node_id)` unique index.
 */
export async function revealPhaseVisibilityGroup(
  gameId: string,
  phase: number,
  visibilityPhaseCount: number,
  revealedAt: Date,
  transaction: Transaction,
): Promise<void> {
  if (!Number.isInteger(phase) || phase < 0 || phase >= visibilityPhaseCount) {
    throw new HttpError(
      500,
      "internal_error",
      `Invalid visibility phase ${phase} for count ${visibilityPhaseCount}`,
    );
  }

  const gameNodeIds = (
    await GameNode.findAll({
      where: { gameId },
      attributes: ["id"],
      transaction,
    })
  ).map((node) => node.id);

  const [homeGroups, nodeGroups] = await Promise.all([
    GameTeamHomeGroup.findAll({ where: { gameId }, transaction }),
    GameNodeVisibilityGroup.findAll({
      where: { gameNodeId: gameNodeIds },
      transaction,
    }),
  ]);

  const nodesByGroup = new Map<number, string[]>();
  for (const row of nodeGroups) {
    const list = nodesByGroup.get(row.groupIndex) ?? [];
    list.push(row.gameNodeId);
    nodesByGroup.set(row.groupIndex, list);
  }

  const visibilityRows: Array<{
    gameTeamId: string;
    gameNodeId: string;
    isFaceUp: boolean;
    source: "phase";
    revealedAt: Date;
  }> = [];

  for (const home of homeGroups) {
    const groupIndex = (home.groupIndex + phase) % visibilityPhaseCount;
    for (const gameNodeId of nodesByGroup.get(groupIndex) ?? []) {
      visibilityRows.push({
        gameTeamId: home.gameTeamId,
        gameNodeId,
        isFaceUp: true,
        source: "phase",
        revealedAt,
      });
    }
  }

  if (visibilityRows.length === 0) return;

  await GameLocationTeamVisibility.bulkCreate(visibilityRows, {
    transaction,
    ignoreDuplicates: true,
  });
}
