import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { GameTeam } from "../../../src/models/game-team.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { setupLightweightGame } from "../../setup/game.ts";

/**
 * Schema smoke for the Phase J `game_teams` hand-completion snapshot
 * migration (chunk 1). Asserts the new columns, CHECK constraints,
 * compound consistency check, and supporting index. Functional wiring
 * (CLAIM_WIN handler, GAME_END snapshot, summary endpoint) lands in
 * chunks 2-5.
 */
describe("game_teams completion snapshot schema (Phase J chunk 1)", () => {
  beforeEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
  });

  afterEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
  });

  describe("columns", () => {
    it.each([
      ["hand_completed_at", true],
      ["winning_tile_id", true],
      ["winning_node_id", true],
      ["final_han", true],
      ["final_fu", true],
      ["final_points", true],
      ["final_yaku_keys", true],
    ])("adds game_teams.%s (allowNull=%s)", async (column, allowNull) => {
      const sequelize = await getSequelize();
      const desc = await sequelize.getQueryInterface().describeTable("game_teams");
      expect(desc).toHaveProperty(column);
      expect(desc[column]!.allowNull).toBe(allowNull);
    });
  });

  describe("constraints", () => {
    it.each([
      "game_teams_final_han_nonneg_check",
      "game_teams_final_fu_nonneg_check",
      "game_teams_final_points_nonneg_check",
      "game_teams_completion_snapshot_consistent",
    ])("registers %s", async (name) => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname = :name`,
        { type: QueryTypes.SELECT, replacements: { name } },
      );
      expect(rows).toHaveLength(1);
    });

    it("multi-column CHECK references every required snapshot column", async () => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'game_teams_completion_snapshot_consistent'`,
        { type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
      const def = rows[0]!.pg_get_constraintdef;
      for (const col of [
        "hand_completed_at",
        "winning_tile_id",
        "winning_node_id",
        "final_han",
        "final_fu",
        "final_points",
      ]) {
        expect(def).toContain(col);
      }
    });

    it("registers the (game_id, hand_completed_at) supporting index", async () => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE tablename = 'game_teams'
            AND indexname = 'idx_game_teams_game_hand_completed'`,
        { type: QueryTypes.SELECT },
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe("runtime behaviour", () => {
    it("accepts the all-NULL backfill shape on existing rows", async () => {
      const { gameTeamIdBySlot } = await setupLightweightGame();
      const team = await GameTeam.findByPk(gameTeamIdBySlot.get(1)!);
      expect(team?.handCompletedAt).toBeNull();
      expect(team?.winningTileId).toBeNull();
      expect(team?.winningNodeId).toBeNull();
      expect(team?.finalHan).toBeNull();
      expect(team?.finalFu).toBeNull();
      expect(team?.finalPoints).toBeNull();
      expect(team?.finalYakuKeys).toBeNull();
    });

    it("rejects a non-negative violation on final_han / final_fu / final_points", async () => {
      const sequelize = await getSequelize();
      const { gameTeamIdBySlot } = await setupLightweightGame();
      const teamId = gameTeamIdBySlot.get(1)!;

      for (const column of ["final_han", "final_fu", "final_points"]) {
        await expect(
          sequelize.transaction(async (transaction) => {
            await sequelize.query(
              `UPDATE game_teams SET ${column} = -1 WHERE id = :id`,
              { replacements: { id: teamId }, transaction },
            );
          }),
        ).rejects.toThrow(new RegExp(`${column}_nonneg`));
      }
    });

    it("rejects a half-completed snapshot (hand_completed_at set, snapshot cols null)", async () => {
      const sequelize = await getSequelize();
      const { gameTeamIdBySlot } = await setupLightweightGame();
      const teamId = gameTeamIdBySlot.get(1)!;

      await expect(
        sequelize.transaction(async (transaction) => {
          await sequelize.query(
            `UPDATE game_teams
                SET hand_completed_at = now()
              WHERE id = :id`,
            { replacements: { id: teamId }, transaction },
          );
        }),
      ).rejects.toThrow(/game_teams_completion_snapshot_consistent/);
    });

    it("allows incomplete-team timer snapshot (final_* set with hand_completed_at NULL)", async () => {
      // The timer end path stamps `final_*` = 0 on noten teams without
      // flipping `hand_completed_at`. The multi-column CHECK is
      // "(hand_completed_at IS NULL) OR (snapshot complete)", which is
      // satisfied by either side — so this row should be accepted.
      const sequelize = await getSequelize();
      const { gameTeamIdBySlot } = await setupLightweightGame();
      const teamId = gameTeamIdBySlot.get(1)!;

      await sequelize.transaction(async (transaction) => {
        await sequelize.query(
          `UPDATE game_teams
              SET final_han = 0,
                  final_fu = 0,
                  final_points = 0
            WHERE id = :id`,
          { replacements: { id: teamId }, transaction },
        );
      });

      const team = await GameTeam.findByPk(teamId);
      expect(team?.handCompletedAt).toBeNull();
      expect(team?.finalHan).toBe(0);
      expect(team?.finalFu).toBe(0);
      expect(team?.finalPoints).toBe(0);
    });

    it("round-trips the full completion snapshot via the model", async () => {
      const { gameTeamIdBySlot, nodeIdByCode, handTiles } = await setupLightweightGame({
        nodeCodes: ["STN_01"],
        nodeTilesByCode: { STN_01: 1 },
        handTilesBySlot: { 1: 1 },
      });
      const teamId = gameTeamIdBySlot.get(1)!;
      const nodeId = nodeIdByCode.get("STN_01")!;
      const winningTileId = handTiles[0]!.gameTileId;

      const team = await GameTeam.findByPk(teamId);
      if (!team) throw new Error("missing game team fixture");
      const now = new Date();
      team.handCompletedAt = now;
      team.winningTileId = winningTileId;
      team.winningNodeId = nodeId;
      team.finalHan = 3;
      team.finalFu = 30;
      team.finalPoints = 4000;
      team.finalYakuKeys = [
        { name: "All Simples", han: 1 },
        { name: "Pinfu", han: 1 },
        { name: "Red Five", han: 1 },
      ];
      await team.save();

      await team.reload();
      expect(team.handCompletedAt?.toISOString()).toBe(now.toISOString());
      expect(team.winningTileId).toBe(winningTileId);
      expect(team.winningNodeId).toBe(nodeId);
      expect(team.finalHan).toBe(3);
      expect(team.finalFu).toBe(30);
      expect(team.finalPoints).toBe(4000);
      expect(team.finalYakuKeys).toEqual([
        { name: "All Simples", han: 1 },
        { name: "Pinfu", han: 1 },
        { name: "Red Five", han: 1 },
      ]);
    });
  });
});
