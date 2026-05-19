import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { assertTestDatabaseUrl } from "./assert-test-database.ts";

async function ensureTestDatabaseExists(testUrl: string): Promise<void> {
  const url = new URL(testUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName) {
    throw new Error("DATABASE_URL_TEST must include a database name");
  }

  url.pathname = "/postgres";
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.join(serverRoot, ".env") });

  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error("DATABASE_URL_TEST is required for integration tests");
  }

  // Snapshot dev URL before we overwrite DATABASE_URL (if present in .env).
  if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL_DEV_SNAPSHOT = process.env.DATABASE_URL;
  }

  assertTestDatabaseUrl(testUrl);

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testUrl;

  await ensureTestDatabaseExists(testUrl);

  const env = { ...process.env };

  execSync("npx sequelize-cli db:migrate", {
    cwd: serverRoot,
    env,
    stdio: "inherit",
  });
  execSync("npx sequelize-cli db:seed:all", {
    cwd: serverRoot,
    env,
    stdio: "inherit",
  });
}
