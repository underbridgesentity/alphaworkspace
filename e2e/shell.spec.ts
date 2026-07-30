import { test, expect, type Page } from "@playwright/test";
import { STATE } from "./paths";
import { expectClean, watch, workspaceSlug } from "./helpers";

/**
 * Commerce-free shell mode, checked the way a store reviewer would check it:
 * by reading the rendered DOM. The Capacitor store binaries load the live
 * site with an "AlphaShell/…" marker appended to the webview user agent, and
 * everything purchasable must be stripped SERVER-SIDE for those requests
 * (Apple 3.1.3(f), Play Billing). The last test is the control: the same
 * pages with an ordinary browser UA must still show billing in full, so the
 * gate cannot silently leak into the web product.
 */
test.use({ storageState: STATE });

/** A realistic Android webview UA carrying the shell marker. */
const SHELL_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 " +
  "AlphaShell/1 (android)";

/**
 * The reviewer's own greps, run over everything the page shows. Rand amounts
 * ("R499"), upgrade language, and the payment provider's name are each an
 * independent tell that commerce reached the DOM.
 */
async function expectNoCommerce(page: Page, where: string): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body, `rand amount in ${where}`).not.toMatch(/R\d/);
  expect(body, `upgrade language in ${where}`).not.toMatch(/upgrade/i);
  expect(body, `PayFast named in ${where}`).not.toMatch(/payfast/i);
  // Nothing may link toward the billing surface either.
  await expect(
    page.locator('a[href*="/settings/billing"]'),
    `billing link in ${where}`,
  ).toHaveCount(0);
  // Nor may a checkout form exist, hidden or not.
  await expect(
    page.locator('form[action*="payfast"]'),
    `checkout form in ${where}`,
  ).toHaveCount(0);
}

test.describe("store shell (AlphaShell UA)", () => {
  test.use({ userAgent: SHELL_UA });

  test("the workspace renders normally with no billing or upgrade in the chrome", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    // The product itself is intact: the shell strips commerce, not the app.
    await page.goto(`/w/${ws}`);
    await expect(page.locator("main#main")).toBeVisible({ timeout: 30_000 });

    // Settings shows General and Members, and no Billing tab at all.
    await page.goto(`/w/${ws}/settings`);
    await expect(page.getByRole("link", { name: "General" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
    await expectNoCommerce(page, "workspace settings");

    expectClean(problems, "shell workspace chrome");
  });

  test("the billing page states the plan as a fact and nothing else", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    // Deep link straight at the billing route, as a reviewer would.
    await page.goto(`/w/${ws}/settings/billing`);
    // The seeded workspace is on the studio band; its name is stated plainly.
    await expect(
      page.getByRole("heading", { name: "Studio plan" }),
    ).toBeVisible({ timeout: 30_000 });

    // None of the web billing surface exists in the DOM: no band picker, no
    // checkout, no cancel, no prices, no provider.
    await expect(page.getByRole("heading", { name: "Bands" })).toHaveCount(0);
    // Named exactly: the theme toggle is also a "Switch to …" button, and it
    // is allowed to exist in the shell.
    await expect(
      page.getByRole("button", {
        name: /Switch to (Team|Studio)|Move to Free|Cancel subscription/,
      }),
    ).toHaveCount(0);
    await expectNoCommerce(page, "shell billing page");

    expectClean(problems, "shell billing page");
  });

  test("/pricing bounces to the app before any price is served", async ({
    page,
  }) => {
    const problems = watch(page);
    await page.goto("/pricing");
    // /pricing redirects to /app, which forwards a signed-in user on to
    // their workspace; either way the pricing page never renders.
    await page.waitForURL(/\/(app$|w\/)/, { timeout: 30_000 });
    expect(page.url()).not.toContain("/pricing");
    await expect(
      page.getByRole("heading", { name: /One number/ }),
    ).toHaveCount(0);
    expectClean(problems, "shell pricing redirect");
  });
});

test.describe("web control (ordinary UA)", () => {
  test("the same pages still show billing in full, so the gate cannot leak", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    // Settings keeps its Billing tab.
    await page.goto(`/w/${ws}/settings`);
    await expect(page.getByRole("link", { name: "Billing" })).toBeVisible({
      timeout: 30_000,
    });

    // The billing page keeps its band picker, rand prices and provider copy.
    await page.goto(`/w/${ws}/settings/billing`);
    await expect(page.getByRole("heading", { name: "Bands" })).toBeVisible({
      timeout: 30_000,
    });
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/R499/);
    expect(body).toMatch(/PayFast/);
    await expect(
      page.getByRole("button", { name: "Switch to Team" }),
    ).toBeVisible();

    // And /pricing still serves its prices to the web.
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/pricing/);
    await expect(
      page.getByRole("heading", { name: /One number/ }),
    ).toBeVisible();

    expectClean(problems, "web billing control");
  });
});
