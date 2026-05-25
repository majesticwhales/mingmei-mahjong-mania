import type { Sequelize } from "sequelize";

/**
 * Mutable tables cleared before each integration/API test.
 * Catalog tables (team_definitions, tile_types, map_templates, …) are kept.
 */
const MUTABLE_TABLES = [
  "game_challenge_submissions",
  "game_challenge_instances",
  "game_scheduled_jobs",
  "game_events",
  "game_command_queue",
  "game_location_team_visibility",
  "game_node_visibility_groups",
  "game_team_home_groups",
  "game_team_positions",
  "game_tile_placements",
  "game_tiles",
  "game_rule_flags",
  "game_edges",
  "game_node_lines",
  "game_nodes",
  "game_lines",
  "game_participants",
  "game_teams",
  "games",
  "lobby_team_assignments",
  "lobby_notifications",
  "lobby_members",
  "lobbies",
  "media_assets",
  "users",
] as const;

export async function truncateMutableTables(sequelize: Sequelize): Promise<void> {
  const quoted = MUTABLE_TABLES.map((t) => `"${t}"`).join(", ");
  await sequelize.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export async function getSequelize(): Promise<Sequelize> {
  const { sequelize } = await import("../../src/config/database.ts");
  return sequelize;
}
