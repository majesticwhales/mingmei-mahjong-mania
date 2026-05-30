import { defineConfig } from "vitest/config";

/** Integration + API tests — uses test DB (globalSetup migrates/seeds). */
export default defineConfig({
  test: {
    name: "integration",
    passWithNoTests: true,
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/setup/env.ts"],
    globalSetup: ["./test/setup/global-setup.ts"],
    fileParallelism: false,
    pool: "threads",
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
