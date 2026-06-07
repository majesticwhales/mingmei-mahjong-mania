import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapGameChallenges } from "../../../src/services/game-challenge-bootstrap.ts";
import { cloneMapTemplateToGame } from "../../../src/services/map-clone-service.ts";
import { Challenge } from "../../../src/models/challenge.ts";
import { ChallengeDeck } from "../../../src/models/challenge-deck.ts";
import { ChallengeType } from "../../../src/models/challenge-type.ts";
import { GameNodeChallenge } from "../../../src/models/game-node-challenge.ts";
import { MapTemplateNode } from "../../../src/models/map-template-node.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { withGameShell } from "../../setup/game.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

/**
 * Per-game-start snapshot of the per-template challenge queue (chunk 2).
 */

const TEST_DECK_CODE = "bootstrap-test-deck";
const TEST_CARD_CODES = [
  "bootstrap-card-A",
  "bootstrap-card-B",
  "bootstrap-card-C",
] as const;

async function clearTestCatalog(): Promise<void> {
  const stale = await Challenge.findAll({
    where: { code: [...TEST_CARD_CODES] },
  });
  if (stale.length > 0) {
    await MapTemplateNodeChallenge.destroy({
      where: { challengeId: stale.map((c) => c.id) },
    });
  }
  await ChallengeDeck.destroy({ where: { code: TEST_DECK_CODE } });
}

describe("bootstrapGameChallenges", () => {
  beforeEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
    await clearTestCatalog();
  });

  afterEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
    await clearTestCatalog();
  });

  it("copies zero rows when the template has no challenge queue", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const cloned = await cloneMapTemplateToGame(
        shell.gameId,
        shell.mapTemplateId,
        transaction,
      );

      const copied = await bootstrapGameChallenges(
        [...cloned.gameNodeIdByTemplateNodeId.keys()],
        cloned.gameNodeIdByTemplateNodeId,
        transaction,
      );

      expect(copied).toBe(0);
      const count = await GameNodeChallenge.count({ transaction });
      expect(count).toBe(0);
    });
  });

  it("copies one challenge per node into game_node_challenges preserving sort_order", async () => {
    const type = await ChallengeType.findOne();
    if (!type) throw new Error("expected at least one seeded challenge_type");

    const deck = await ChallengeDeck.create({
      code: TEST_DECK_CODE,
      name: "Bootstrap test deck",
      isActive: true,
      sortOrder: 0,
    });
    const card = await Challenge.create({
      challengeDeckId: deck.id,
      challengeTypeId: type.id,
      code: TEST_CARD_CODES[0],
      title: "Card A",
      description: "desc",
      flavorText: "flavour",
      parameters: {},
      sortOrder: 0,
      isActive: true,
    });

    // Attach the card to every template node so the per-node check below
    // doesn't depend on which seeded template was picked.
    const templateNodes = await MapTemplateNode.findAll({ attributes: ["id"] });
    expect(templateNodes.length).toBeGreaterThan(0);
    await MapTemplateNodeChallenge.bulkCreate(
      templateNodes.map((node) => ({
        mapTemplateNodeId: node.id,
        challengeId: card.id,
        sortOrder: 0,
      })),
    );

    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const cloned = await cloneMapTemplateToGame(
        shell.gameId,
        shell.mapTemplateId,
        transaction,
      );

      const copied = await bootstrapGameChallenges(
        [...cloned.gameNodeIdByTemplateNodeId.keys()],
        cloned.gameNodeIdByTemplateNodeId,
        transaction,
      );

      expect(copied).toBe(templateNodes.length);

      const rows = await GameNodeChallenge.findAll({
        where: { gameNodeId: [...cloned.gameNodeIdByTemplateNodeId.values()] },
        transaction,
      });
      expect(rows).toHaveLength(templateNodes.length);
      for (const row of rows) {
        expect(row.challengeId).toBe(card.id);
        expect(row.sortOrder).toBe(0);
      }
    });
  });

  it("preserves the ordered queue when a node carries multiple challenges", async () => {
    const type = await ChallengeType.findOne();
    if (!type) throw new Error("expected at least one seeded challenge_type");

    const deck = await ChallengeDeck.create({
      code: TEST_DECK_CODE,
      name: "Bootstrap test deck",
      isActive: true,
      sortOrder: 0,
    });
    const cards = await Promise.all(
      TEST_CARD_CODES.map((code, idx) =>
        Challenge.create({
          challengeDeckId: deck.id,
          challengeTypeId: type.id,
          code,
          title: `Card ${idx}`,
          description: null,
          flavorText: null,
          parameters: {},
          sortOrder: idx,
          isActive: true,
        }),
      ),
    );

    // Attach the three-card queue to a single template node.
    const templateNode = await MapTemplateNode.findOne();
    if (!templateNode) throw new Error("expected at least one seeded template node");
    await MapTemplateNodeChallenge.bulkCreate(
      cards.map((card, idx) => ({
        mapTemplateNodeId: templateNode.id,
        challengeId: card.id,
        sortOrder: idx,
      })),
    );

    const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });

    await withGameShell(lobbyId, async (shell, transaction) => {
      const cloned = await cloneMapTemplateToGame(
        shell.gameId,
        shell.mapTemplateId,
        transaction,
      );

      const copied = await bootstrapGameChallenges(
        [...cloned.gameNodeIdByTemplateNodeId.keys()],
        cloned.gameNodeIdByTemplateNodeId,
        transaction,
      );
      expect(copied).toBe(TEST_CARD_CODES.length);

      const gameNodeId = cloned.gameNodeIdByTemplateNodeId.get(templateNode.id);
      const queue = await GameNodeChallenge.findAll({
        where: { gameNodeId: gameNodeId! },
        order: [["sortOrder", "ASC"]],
        transaction,
      });
      expect(queue.map((q) => q.sortOrder)).toEqual([0, 1, 2]);
      expect(queue.map((q) => q.challengeId)).toEqual(cards.map((c) => c.id));
    });
  });
});
