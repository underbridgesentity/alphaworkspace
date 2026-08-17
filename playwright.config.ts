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
/**
 * localhost, not 127.0.0.1. Next 16 blocks cross-origin requests to its own dev
 * resources, and it treats the two as different origins, so browsing the IP
 * literal got every dev chunk refused: the pages still SERVER rendered and
 * still looked right in a screenshot, but React never hydrated and no click in
 * the product did anything. Read-only tests cannot see that; write tests can.
 */
const baseURL = `http://localhost:${PORT}`;

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
    /*
     * The device-specific specs are scoped to the projects they were written
     * for. Without this, `npx playwright test` runs store-shots on desktop,
     * where the size assertion cannot pass, and reports a broken suite for a
     * spec that was never meant to run there.
     */
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/tablet\.spec\.ts/, /store-shots\.spec\.ts/],
      dependencies: ["setup"],
    },
    // The product law is mobile first on a cheap Android, so it is a first
    // class target here, not an afterthought.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore: [/tablet\.spec\.ts/, /store-shots\.spec\.ts/],
      dependencies: ["setup"],
    },
    /*
     * iPad, because the iOS binary declares TARGETED_DEVICE_FAMILY "1,2" and
     * Apple reviews on the device families you claim. The layout had never
     * been looked at above phone width and below desktop.
     *
     * 1032x1376 at deviceScaleFactor 2 is the iPad Pro 13" logical viewport,
     * and it renders at exactly 2064x2752, which is the screenshot size App
     * Store Connect demands for that family. So the audit and the store assets
     * come out of the same run and cannot drift apart.
     */
    {
      name: "ipad",
      use: {
        viewport: { width: 1032, height: 1376 },
        deviceScaleFactor: 2,
        isMobile: false, // iPadOS Safari reports desktop-class
        hasTouch: true,
        /*
         * The window must be at least as tall as the viewport. 1376 CSS px is
         * taller than Chromium's default window, and when the viewport exceeds
         * the window the capture is TILED: anything `position: sticky` or
         * `fixed` is painted again in every tile, so the app header appeared a
         * second time near the bottom of the image. It looks exactly like a
         * duplicated-component bug and is purely an artefact of the capture.
         * Verified against the DOM: one <header>, one "New task" control, and
         * scrollHeight equal to the viewport.
         */
        launchOptions: { args: ["--window-size=1100,1500"] },
      },
      testMatch: [/tablet\.spec\.ts/, /store-shots\.spec\.ts/],
      dependencies: ["setup"],
    },
    /*
     * iPhone 6.9" (16 Pro Max) at 440x956 and dSF 3, which renders 1320x2868:
     * the one iPhone screenshot size App Store Connect asks for. Providing 6.9"
     * makes the 6.5" set optional, so this is the only iPhone target needed.
     *
     * Distinct from the "mobile" Pixel 7 project, which exists to enforce the
     * mobile-first product law on a cheap Android and should stay that way.
     */
    {
      name: "iphone",
      use: {
        viewport: { width: 440, height: 956 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: [/store-shots\.spec\.ts/],
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
