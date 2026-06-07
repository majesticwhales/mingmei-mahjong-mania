import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { Game } from "../../../src/models/game.ts";
import { Lobby } from "../../../src/models/lobby.ts";
import { MapTemplate } from "../../../src/models/map-template.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";
import { setupLightweightGame } from "../../setup/game.ts";

/**
 * Schema smoke for the visibility-mode migration (chunk 1). Asserts the
 * new column exists on each of the three tables, defaults to `"both"`,
 * and that the CHECK constraint rejects bogus values. The functional
 * wiring (lobby surface, engine snapshot, projection branching) lives
 * in subsequent chunks.
 */
describe("visibility-mode schema (chunk 1)", () => {
  beforeEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
  });

  afterEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
  });

  describe("columns and defaults", () => {
    it("adds map_templates.default_visibility_mode (NOT NULL, default 'both')", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("map_templates");
      expect(desc).toHaveProperty("default_visibility_mode");
      expect(desc.default_visibility_mode!.allowNull).toBe(false);
      expect(desc.default_visibility_mode!.defaultValue).toBe("both");
    });

    it("adds lobbies.visibility_mode (NOT NULL, default 'both')", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("lobbies");
      expect(desc).toHaveProperty("visibility_mode");
      expect(desc.visibility_mode!.allowNull).toBe(false);
      expect(desc.visibility_mode!.defaultValue).toBe("both");
    });

    it("adds games.visibility_mode (NOT NULL, default 'both')", async () => {
      const sequelize = await getSequelize();
      const desc = await sequelize
        .getQueryInterface()
        .describeTable("games");
      expect(desc).toHaveProperty("visibility_mode");
      expect(desc.visibility_mode!.allowNull).toBe(false);
      expect(desc.visibility_mode!.defaultValue).toBe("both");
    });
  });

  describe("CHECK constraints", () => {
    /**
     * The migration emits a single CHECK per table that lists the four
     * enum values. We assert the constraint exists and references every
     * value (`pg_get_constraintdef` returns the literal SQL).
     */
    it.each([
      ["map_templates", "map_templates_default_visibility_mode_check"],
      ["lobbies", "lobbies_visibility_mode_check"],
      ["games", "games_visibility_mode_check"],
    ])("%s constraint %s lists every enum value", async (_table, name) => {
      const sequelize = await getSequelize();
      const rows = await sequelize.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = :name`,
        { type: QueryTypes.SELECT, replacements: { name } },
      );
      expect(rows).toHaveLength(1);
      const def = rows[0]!.pg_get_constraintdef;
      for (const value of ["none", "phase", "slot", "both"]) {
        expect(def).toContain(`'${value}'`);
      }
    });
  });

  describe("model + DB defaults agree", () => {
    /**
     * The seeded map_template was backfilled to `'both'` at migration
     * time; the model column default keeps Sequelize agreeing.
     */
    it("existing map_templates rows default to 'both'", async () => {
      const template = await MapTemplate.findOne();
      if (!template) throw new Error("expected at least one seeded map_template");
      expect(template.defaultVisibilityMode).toBe("both");
    });

    it("a lobby created via the standard fixture inherits 'both'", async () => {
      const { lobbyId } = await createLobbyWithFourPlayers();
      const lobby = await Lobby.findByPk(lobbyId);
      expect(lobby?.visibilityMode).toBe("both");
    });

    it("a lightweight game inherits 'both' via the column default", async () => {
      // The lightweight fixture never sets `visibilityMode`, so the
      // Sequelize / DB default both kick in. Pins the model + migration
      // default in sync.
      const { gameId } = await setupLightweightGame();
      const game = await Game.findByPk(gameId);
      expect(game?.visibilityMode).toBe("both");
    });

    it("rejects an out-of-enum value via CHECK", async () => {
      const sequelize = await getSequelize();
      const template = await MapTemplate.findOne();
      if (!template) throw new Error("expected at least one seeded map_template");

      // Wrap in a nested transaction so the failed UPDATE doesn't poison
      // the suite-level connection state. Sequelize uses a SAVEPOINT here.
      await expect(
        sequelize.transaction(async (transaction) => {
          await sequelize.query(
            `UPDATE map_templates SET default_visibility_mode = 'bogus' WHERE id = :id`,
            { replacements: { id: template.id }, transaction },
          );
        }),
      ).rejects.toThrow(/visibility_mode/);

      // Reload to confirm nothing was written.
      await template.reload();
      expect(template.defaultVisibilityMode).toBe("both");
    });
  });
});
