import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { Challenge } from "../../../src/models/challenge.ts";
import { ChallengeDeck } from "../../../src/models/challenge-deck.ts";
import { ChallengeType } from "../../../src/models/challenge-type.ts";
import { GameChallengeInstance } from "../../../src/models/game-challenge-instance.ts";
import { GameNode } from "../../../src/models/game-node.ts";
import { GameNodeChallenge } from "../../../src/models/game-node-challenge.ts";
import { GameTeamPosition } from "../../../src/models/game-team-position.ts";
import { MapTemplateNode } from "../../../src/models/map-template-node.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { createGameShellWithMap } from "../../setup/game.ts";

/**
 * Schema smoke for the node-challenge migration (chunk 1). Asserts the
 * new tables, columns, CHECK constraints, and credit-flag defaults; the
 * functional behaviour (game-start copy, engine handlers, projection) is
 * exercised by subsequent chunks.
 */
const SMOKE_DECK_CODE = "smoke-deck";
const SMOKE_CARD_CODE = "smoke-card";

/**
 * Catalog tables (`challenges` / `challenge_decks` /
 * `map_template_node_challenges`) are intentionally NOT in
 * `MUTABLE_TABLES`, so a runtime test that creates rows there must
 * tidy up itself. Deletion order matters: the join table FK on
 * `challenge_id` is `ON DELETE RESTRICT`, so we strip join rows first,
 * then let the `ON DELETE CASCADE` from `challenge_decks` -> `challenges`
 * drop the card.
 */
async function clearSmokeCatalog(): Promise<void> {
  const stale = await Challenge.findAll({ where: { code: SMOKE_CARD_CODE } });
  if (stale.length > 0) {
    await MapTemplateNodeChallenge.destroy({
      where: { challengeId: stale.map((c) => c.id) },
    });
  }
  await ChallengeDeck.destroy({ where: { code: SMOKE_DECK_CODE } });
}

describe("node challenge schema (chunk 1)", () => {
  beforeEach(async () => {
    const sequelize = await getSequelize();
    // Truncate first so any lingering game_challenge_instances row
    // (which would FK-RESTRICT a Challenge delete) is gone before we
    // touch the catalog. Recovers from past aborted runs without a
    // manual DB wipe.
    await truncateMutableTables(sequelize);
    await clearSmokeCatalog();
  });

  afterEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
    await clearSmokeCatalog();
  });

  describe("tables and columns", () => {
    it("creates map_template_node_challenges with the expected columns", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("map_template_node_challenges");
      expect(Object.keys(desc).sort()).toEqual(
        [
          "challenge_id",
          "created_at",
          "id",
          "map_template_node_id",
          "sort_order",
          "updated_at",
        ].sort(),
      );
    });

    it("creates game_node_challenges with the expected columns", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("game_node_challenges");
      expect(Object.keys(desc).sort()).toEqual(
        [
          "challenge_id",
          "created_at",
          "game_node_id",
          "id",
          "sort_order",
          "updated_at",
        ].sort(),
      );
    });

    it("adds challenges.flavor_text (nullable text)", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize.getQueryInterface().describeTable("challenges");
      expect(desc).toHaveProperty("flavor_text");
      expect(desc.flavor_text!.allowNull).toBe(true);
    });

    it("adds game_challenge_instances.game_node_challenge_id (NOT NULL) and cooldown_until (nullable)", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("game_challenge_instances");
      expect(desc).toHaveProperty("game_node_challenge_id");
      expect(desc.game_node_challenge_id!.allowNull).toBe(false);
      expect(desc).toHaveProperty("cooldown_until");
      expect(desc.cooldown_until!.allowNull).toBe(true);
    });

    it("adds game_team_positions.pending_swap_credit (NOT NULL with default false) and no longer carries credit_earned_in_session", async () => {
      // `credit_earned_in_session` was the session-wide "one credit per
      // check-in" gate; it was dropped in 20260613120000 because the
      // per-station cooldown already paces challenge re-attempts.
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("game_team_positions");
      expect(desc).toHaveProperty("pending_swap_credit");
      expect(desc.pending_swap_credit!.allowNull).toBe(false);
      expect(desc).not.toHaveProperty("credit_earned_in_session");
    });
  });

  describe("constraints", () => {
    it("status CHECK lists the new honor-system + legacy values", async () => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'game_challenge_instances_status_check'`,
        { type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      const def = rows[0]!.pg_get_constraintdef;
      for (const value of [
        "in_progress",
        "completed",
        "failed",
        "active",
        "submitted",
        "approved",
        "rejected",
        "cancelled",
      ]) {
        expect(def).toContain(`'${value}'`);
      }
    });

    it("sort_order CHECKs reject negative values on both queue tables", async () => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conname IN (
            'map_template_node_challenges_sort_order_nonneg_check',
            'game_node_challenges_sort_order_nonneg_check'
          )`,
        { type: QueryTypes.SELECT },
      );
      expect(rows.map((r) => r.conname).sort()).toEqual([
        "game_node_challenges_sort_order_nonneg_check",
        "map_template_node_challenges_sort_order_nonneg_check",
      ]);
    });
  });

  describe("runtime behaviour", () => {
    it("round-trips a queue (template -> game -> instance) and enforces uniqueness + status CHECK + credit defaults", async () => {
      const sequelize = await getSequelize();

      // Seed a deck + challenge against an existing seeded challenge_type.
      const type = await ChallengeType.findOne();
      if (!type) throw new Error("expected at least one seeded challenge_type");
      const deck = await ChallengeDeck.create({
        code: SMOKE_DECK_CODE,
        name: "Smoke deck",
        isActive: true,
        sortOrder: 0,
      });
      const challenge = await Challenge.create({
        challengeDeckId: deck.id,
        challengeTypeId: type.id,
        code: SMOKE_CARD_CODE,
        title: "Smoke card",
        description: "desc",
        flavorText: "flavour",
        parameters: {},
        sortOrder: 0,
        isActive: true,
      });

      // Attach a queue row to a real template node and assert the
      // unique (template_node, sort_order) constraint rejects collisions.
      const templateNode = await MapTemplateNode.findOne();
      if (!templateNode) throw new Error("expected at least one seeded template node");
      await MapTemplateNodeChallenge.create({
        mapTemplateNodeId: templateNode.id,
        challengeId: challenge.id,
        sortOrder: 0,
      });
      await expect(
        MapTemplateNodeChallenge.create({
          mapTemplateNodeId: templateNode.id,
          challengeId: challenge.id,
          sortOrder: 0,
        }),
      ).rejects.toThrow();
      await MapTemplateNodeChallenge.create({
        mapTemplateNodeId: templateNode.id,
        challengeId: challenge.id,
        sortOrder: 1,
      });

      // Spin up a real game so the per-game tables have valid FK targets.
      const { lobbyId } = await createLobbyWithFourPlayers({ assignTeams: false });
      await sequelize.transaction(async (transaction) => {
        const shell = await createGameShellWithMap(lobbyId, transaction);
        const gameNode = await GameNode.findOne({
          where: { gameId: shell.gameId, templateNodeId: templateNode.id },
          transaction,
        });
        if (!gameNode) throw new Error("expected cloned game_node for template node");
        const gameNodeChallenge = await GameNodeChallenge.create(
          {
            gameNodeId: gameNode.id,
            challengeId: challenge.id,
            sortOrder: 0,
          },
          { transaction },
        );

        // Unique (game_node, sort_order) rejects collisions. Wrap in a
        // savepoint so the unique-violation rolls back only the inner
        // statement; without this the outer transaction enters the
        // "aborted, commands ignored" state and every later insert fails.
        await expect(
          sequelize.transaction({ transaction }, async (sp) => {
            await GameNodeChallenge.create(
              {
                gameNodeId: gameNode.id,
                challengeId: challenge.id,
                sortOrder: 0,
              },
              { transaction: sp },
            );
          }),
        ).rejects.toThrow();

        const teamId = [...shell.gameTeamIdBySlot.values()][0]!;

        // Round-trip an instance through in_progress -> completed + cooldown.
        const cooldownUntil = new Date(Date.now() + 5 * 60 * 1000);
        const instance = await GameChallengeInstance.create(
          {
            gameId: shell.gameId,
            gameTeamId: teamId,
            challengeId: challenge.id,
            gameNodeChallengeId: gameNodeChallenge.id,
            status: "in_progress",
            assignedAt: new Date(),
            cooldownUntil: null,
          },
          { transaction },
        );
        await instance.update(
          {
            status: "completed",
            resolvedAt: new Date(),
            cooldownUntil,
          },
          { transaction },
        );
        await instance.reload({ transaction });
        expect(instance.status).toBe("completed");
        expect(instance.cooldownUntil).toBeInstanceOf(Date);

        // Unknown status is rejected by the CHECK. Savepoint-wrapped
        // for the same reason as the unique-violation check above.
        await expect(
          sequelize.transaction({ transaction }, async (sp) => {
            await GameChallengeInstance.create(
              {
                gameId: shell.gameId,
                gameTeamId: teamId,
                challengeId: challenge.id,
                gameNodeChallengeId: gameNodeChallenge.id,
                status: "definitely-not-a-status" as never,
                assignedAt: new Date(),
              },
              { transaction: sp },
            );
          }),
        ).rejects.toThrow();

        // Position row credit flags default to false in PG even when the
        // ORM omits them from the INSERT.
        const position = await GameTeamPosition.create(
          {
            gameTeamId: teamId,
            currentGameNodeId: null,
            checkedInAt: null,
          },
          { transaction },
        );
        expect(position.pendingSwapCredit).toBe(false);
      });
    });
  });
});
