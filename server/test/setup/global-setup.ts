import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertTestDatabaseUrl } from "./assert-test-database.ts";

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
