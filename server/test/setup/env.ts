import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
dotenv.config({ path: path.join(serverRoot, ".env") });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. Copy server/.env.example to server/.env and create the test database.",
  );
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
