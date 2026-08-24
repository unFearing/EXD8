import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      testIgnore: /deck-board-regressions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testMatch: /deck-board-regressions\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  // Note: Requires manual setup before running tests:
  // 1. In one terminal: cd api && npm run build && func start (or ./dev-local.sh)
  // 2. In another terminal: cd app && npm run dev
  // Then run: npx playwright test
});
