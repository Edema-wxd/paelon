import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests need a live Neon branch; they are opt-in via
    // TEST_DATABASE_URL rather than failing a developer with no DB.
    exclude: ["node_modules/**", "tests/integration/**"],
  },
  resolve: {
    alias: { "@": resolve(fileURLToPath(new URL(".", import.meta.url))) },
  },
});
