import { test as setup, expect } from "@playwright/test";
import { STATE } from "./paths";

/**
 * Signs in once and saves the session, so every journey does not pay for a
 * fresh login. This drives the REAL password provider (the seed writes a real
 * bcrypt hash for the demo accounts, there is no dev bypass by design), so a
 * break in the actual auth path fails here rather than being mocked away.
 */
const EMAIL = process.env.E2E_EMAIL ?? "lerato@mzansi.studio";
const PASSWORD = process.env.E2E_PASSWORD ?? "local-dev-password";

setup("sign in as the workspace owner", async ({ page }) => {
  // The whole app compiles on first touch in dev, and concurrent work can
  // invalidate that build mid-run; give the one-off sign-in room to absorb
  // a cold compile rather than reporting it as an auth failure.
  setup.setTimeout(150_000);
  await page.goto("/sign-in?mode=password");

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|continue/i }).click();

  // Landing anywhere under /w/ means the session is real and a workspace
  // resolved. Waiting on the URL rather than a spinner keeps this honest.
  // 60s, not 30: a cold Turbopack compile of /app can take ~35s when other
  // work has just invalidated the dev build, and that is not an auth failure.
  await page.waitForURL(/\/w\/[^/]+/, { timeout: 60_000 });
  await expect(page).toHaveURL(/\/w\//);

  await page.context().storageState({ path: STATE });
});
