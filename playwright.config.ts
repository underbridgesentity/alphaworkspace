import { defineConfig, devices } from "@playwright/test";

/**
 * End to end tests against the SEEDED LOCAL database, never production.
 * `npm run dev:local` refuses to start unless DATABASE_URL is on localhost
 * (scripts/with-local-env.ts), so this cannot accidentally drive the live app.
 *
 * Port 3100 rather than 3000: another dev server frequently holds 3000, and a
 * suite that fails because of a port collision teaches nobody anything.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Journeys share a signed-in session and a single seeded workspace, so they
  // run in order rather than racing each other over the same rows.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "e2e/.artifacts",

  use: {
    baseURL,
    // Evidence when something fails, which is the whole point of this suite.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    // Auth runs first and hands its saved session to the rest.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    // The product law is mobile first on a cheap Android, so it is a first
    // class target here, not an afterthought.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: `E2E_PORT=${PORT} npm run dev:local -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
