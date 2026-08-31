import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Integration tests. Separate config because they need a real Postgres endpoint
 * reachable by the Neon driver — a Neon dev branch, or local Postgres behind a
 * WebSocket proxy — supplied as TEST_DATABASE_URL.
 *
 * They are excluded from `npm test` on purpose: a developer with no database
 * should still be able to run the unit suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // These hit a real database; running files in parallel would let one test's
    // truncate wipe another's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(fileURLToPath(new URL(".", import.meta.url))) },
  },
});
