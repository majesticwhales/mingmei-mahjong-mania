import { beforeEach, describe, expect, it } from "vitest";
import { bootstrapGameChallenges } from "../../../src/services/game-challenge-bootstrap.ts";
import { cloneMapTemplateToGame } from "../../../src/services/map-clone-service.ts";
import { GameNodeChallenge } from "../../../src/models/game-node-challenge.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { withGameShell } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Per-game-start snapshot of the per-template challenge queue.
 *
 * `globalSetup` runs `db:seed:all`, which populates
 * `map_template_node_challenges` from
 * `server/seeders/data/challenges/ttc-2026.json`. These tests exercise
 * the bootstrap pipeline against that real seeded content so the
 * assertions match what production will see; `map_template_node_challenges`
 * is a catalog table (not truncated between tests) and we treat it as
 * the source of truth at query time rather than hard-coding station codes.
 */

describe("bootstrapGameChallenges", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 0 when called with an empty template node id list", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (_shell, transaction) => {
      const copied = await bootstrapGameChallenges([], new Map(), transaction);
      expect(copied).toBe(0);
      const count = await GameNodeChallenge.count({ transaction });
      expect(count).toBe(0);
    });
  });

  it("copies every seeded map_template_node_challenges row into game_node_challenges keyed by cloned game node", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const cloned = await cloneMapTemplateToGame(
        shell.gameId,
        shell.mapTemplateId,
        transaction,
      );

      const templateNodeIds = [...cloned.gameNodeIdByTemplateNodeId.keys()];
      const seededBindings = await MapTemplateNodeChallenge.findAll({
        where: { mapTemplateNodeId: templateNodeIds },
        transaction,
      });
      expect(seededBindings.length).toBeGreaterThan(0);

      const copied = await bootstrapGameChallenges(
        templateNodeIds,
        cloned.gameNodeIdByTemplateNodeId,
        transaction,
      );

      expect(copied).toBe(seededBindings.length);

      const clonedRows = await GameNodeChallenge.findAll({
        where: { gameNodeId: [...cloned.gameNodeIdByTemplateNodeId.values()] },
        transaction,
      });
      expect(clonedRows).toHaveLength(seededBindings.length);

      // Every cloned row matches a seeded binding by (templateNode, challengeId, sortOrder).
      const gameNodeToTemplateNode = new Map<string, string>();
      for (const [templateNodeId, gameNodeId] of cloned.gameNodeIdByTemplateNodeId.entries()) {
        gameNodeToTemplateNode.set(gameNodeId, templateNodeId);
      }
      const tripleKey = (
        templateNodeId: string,
        challengeId: string,
        sortOrder: number,
      ): string => `${templateNodeId}:${challengeId}:${sortOrder}`;
      const seededKeys = new Set(
        seededBindings.map((b) =>
          tripleKey(b.mapTemplateNodeId, b.challengeId, b.sortOrder),
        ),
      );
      for (const row of clonedRows) {
        const templateNodeId = gameNodeToTemplateNode.get(row.gameNodeId);
        expect(templateNodeId).toBeDefined();
        expect(
          seededKeys.has(tripleKey(templateNodeId!, row.challengeId, row.sortOrder)),
        ).toBe(true);
      }
    });
  });

  it("preserves the seeded sort_order for stations that carry multiple challenges", async () => {
    // Find any seeded multi-card station at runtime so the assertion
    // tracks whatever the JSON authoring file currently ships
    // (Union + Yorkdale today, but this stays green if the content
    // changes as long as at least one station has a multi-card queue).
    const allBindings = await MapTemplateNodeChallenge.findAll({
      order: [["sortOrder", "ASC"]],
    });
    const byTemplate = new Map<string, MapTemplateNodeChallenge[]>();
    for (const b of allBindings) {
      const list = byTemplate.get(b.mapTemplateNodeId) ?? [];
      list.push(b);
      byTemplate.set(b.mapTemplateNodeId, list);
    }
    const multiCard = [...byTemplate.entries()].find(([, list]) => list.length > 1);
    expect(
      multiCard,
      "seeded TTC 2026 data must include at least one multi-card station",
    ).toBeDefined();
    const [multiCardTemplateNodeId, seededQueue] = multiCard!;

    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const cloned = await cloneMapTemplateToGame(
        shell.gameId,
        shell.mapTemplateId,
        transaction,
      );

      await bootstrapGameChallenges(
        [...cloned.gameNodeIdByTemplateNodeId.keys()],
        cloned.gameNodeIdByTemplateNodeId,
        transaction,
      );

      const clonedNodeId = cloned.gameNodeIdByTemplateNodeId.get(
        multiCardTemplateNodeId,
      );
      expect(clonedNodeId).toBeDefined();

      const queue = await GameNodeChallenge.findAll({
        where: { gameNodeId: clonedNodeId! },
        order: [["sortOrder", "ASC"]],
        transaction,
      });
      expect(queue.map((q) => q.sortOrder)).toEqual(
        seededQueue.map((q) => q.sortOrder),
      );
      expect(queue.map((q) => q.challengeId)).toEqual(
        seededQueue.map((q) => q.challengeId),
      );
    });
  });
});
