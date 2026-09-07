import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config (CLAUDE.md testing floor).
 *
 * Mobile Chrome only, and deliberately so. The budgets in spec §13 are all
 * stated for mobile, the booking flow is specified as one screen per step on
 * mobile, and a second desktop project would double the runtime to re-test
 * layouts that Lighthouse and manual review already cover. Add projects when
 * there is a desktop-only behaviour worth guarding.
 *
 * These specs need a database: every page reads content through
 * `lib/db/queries/*`. `webServer` starts `next dev`, which picks up
 * `.env.local`, so DATABASE_URL must be set and seeded before running them.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // The unit suite lives in tests/ and belongs to Vitest. Without this,
  // Playwright would try to collect it.
  testMatch: /.*\.e2e\.ts/,

  // A test that passes only when run alone is not evidence of anything.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
