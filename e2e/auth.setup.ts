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
  await page.goto("/sign-in?mode=password");

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|continue/i }).click();

  // Landing anywhere under /w/ means the session is real and a workspace
  // resolved. Waiting on the URL rather than a spinner keeps this honest.
  await page.waitForURL(/\/w\/[^/]+/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/w\//);

  await page.context().storageState({ path: STATE });
});
