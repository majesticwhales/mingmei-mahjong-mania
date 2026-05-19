import { defineConfig } from "vitest/config";

/** Unit tests only — no DB migrate/seed. */
export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/smoke.test.ts"],
    setupFiles: ["./test/setup/env.ts"],
  },
});
