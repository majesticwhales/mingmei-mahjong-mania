/**
 * Refuse to run DB-backed tests against a non-test database.
 */
export function assertTestDatabaseUrl(databaseUrl: string): void {
  let pathname: string;
  try {
    pathname = new URL(databaseUrl).pathname;
  } catch {
    throw new Error(`Invalid DATABASE_URL_TEST: ${databaseUrl}`);
  }

  const dbName = pathname.replace(/^\//, "");
  if (!dbName) {
    throw new Error("DATABASE_URL_TEST must include a database name");
  }

  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run tests: database "${dbName}" does not look like a test database (name must contain "test")`,
    );
  }

  const devUrl = process.env.DATABASE_URL_DEV_SNAPSHOT;
  if (devUrl && devUrl === databaseUrl) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL_TEST matches dev DATABASE_URL",
    );
  }
}
