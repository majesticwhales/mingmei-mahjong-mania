export default async function globalTeardown(): Promise<void> {
  try {
    const { sequelize } = await import("../../src/config/database.ts");
    await sequelize.close();
  } catch {
    // No connection opened yet (unit-only run) — ignore.
  }
}
