import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { test, expect, type Page } from "@playwright/test";
import { STATE } from "./paths";
import { expectClean, watch, workspaceSlug } from "./helpers";

/**
 * The billing surface, everything around the money without moving any.
 *
 * Real PayFast checkout cannot run locally and must never be driven against
 * production, so the contract proven here is the client side of the money
 * path: the page states the truth about plan and usage, the checkout hand-off
 * posts a well-formed signed field list at the SANDBOX host, and the
 * cancellation dialog cannot fire a DELETE from its "Keep plan" exit. Every
 * request toward payfast.co.za is intercepted and answered locally; nothing
 * in this file can reach PayFast, sandbox or live.
 *
 * Local reality these tests are written against: the seeded workspace is on
 * the studio band with NO subscription row, and PAYFAST_PRORATION=false, so
 * `bandChanges` is always empty and every band switch takes the full-checkout
 * hand-off. The in-place quote dialog therefore cannot be reached locally and
 * is deliberately not driven here.
 */
test.use({ storageState: STATE });

/** All three bands and their monthly rand prices, straight from plans.ts. */
const BANDS = [
  { name: "Free", monthly: "R0" },
  { name: "Team", monthly: "R499" },
  { name: "Studio", monthly: "R999" },
] as const;

async function gotoBilling(page: Page, ws: string): Promise<void> {
  await page.goto(`/w/${ws}/settings/billing`);
  await expect(page.getByRole("heading", { name: "Bands" })).toBeVisible({
    timeout: 30_000,
  });
}

/** The band picker section, so price assertions cannot leak into dialog copy. */
function bandsSection(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Bands" }) });
}

/**
 * DATABASE_URL from .env.dev-local, refused unless it points at localhost.
 * Same stance as scripts/with-local-env.ts: a cleanup helper that could ever
 * aim a DELETE at a remote database is worse than no cleanup at all.
 */
function localDatabaseUrl(): string {
  const file = path.join(__dirname, "..", ".env.dev-local");
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("no DATABASE_URL in .env.dev-local");
  const url = line.slice("DATABASE_URL=".length).trim();
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`refusing non-local database host: ${host}`);
  }
  return url;
}

/**
 * Removes the pending subscription row(s) the checkout hand-off wrote.
 *
 * This is the one cleanup in the suite that cannot go through the product:
 * an abandoned checkout has no UI (in production PayFast's ITN or a comp
 * supersedes it), and the only route that touches subscriptions is the
 * cancel, which with no active row would drop the seeded workspace to Free.
 * So the rows are deleted directly, scoped to this workspace, this test's
 * time window, and status "pending", which can never describe a live paid
 * mandate. Returns the removed references so the caller can assert exactly
 * what existed.
 */
async function cleanPendingSubscriptions(
  ws: string,
  since: Date,
): Promise<string[]> {
  const sql = postgres(localDatabaseUrl(), { max: 1 });
  try {
    const rows = await sql`
      delete from subscriptions
      using workspaces
      where subscriptions.workspace_id = workspaces.id
        and workspaces.slug = ${ws}
        and subscriptions.status = 'pending'
        and subscriptions.created_at >= ${since}
      returning subscriptions.m_payment_id
    `;
    return rows.map((r) => r.m_payment_id as string);
  } finally {
    await sql.end();
  }
}

test.describe("billing surface", () => {
  test("states the current plan, usage and rand-priced bands, silently", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    await gotoBilling(page, ws);

    // The sandbox notice is the local safety net made visible: if this ever
    // fails locally, the env shadowing has broken and nothing else in this
    // file should be trusted.
    await expect(
      page.getByText("PayFast sandbox mode, no real money moves."),
    ).toBeVisible();

    // Current plan, stated with live usage against its limits. One paragraph
    // carries all three figures; the band cards repeat similar words, so the
    // usage assertions are pinned to the "n/25 people" line.
    await expect(
      page.getByRole("heading", { name: "Studio plan" }),
    ).toBeVisible();
    const usage = page.getByText(/\/25 people/);
    await expect(usage).toBeVisible({ timeout: 15_000 });
    await expect(usage).toContainText(/\d+ active projects/);
    await expect(usage).toContainText(/\d+\/\d+ voice captures this month/);

    // Band cards, each with its rand price. Prices scoped to the band picker
    // so a match cannot come from dialog or retention copy elsewhere on the
    // page. \s?\d{3} tolerates the en-ZA thousands space in annual prices.
    const bands = bandsSection(page);
    for (const band of BANDS) {
      await expect(
        bands.getByRole("heading", { name: band.name, exact: true }),
      ).toBeVisible();
      await expect(
        bands.locator(`h3:text-is("${band.name}") + p`),
      ).toContainText(band.monthly);
    }

    // The annual toggle reprices in rand too (two months free).
    await bands.getByRole("button", { name: /Annual/ }).click();
    await expect(bands.getByText(/R4[\s,]?990/)).toBeVisible();
    await expect(bands.getByText(/R9[\s,]?990/)).toBeVisible();
    await bands.getByRole("button", { name: "Monthly" }).click();
    await expect(bands.getByText(/R999/)).toBeVisible();

    // The seeded owner sees the right affordance on every card.
    await expect(bands.getByText("Your current band")).toBeVisible();
    await expect(
      bands.getByRole("button", { name: "Switch to Team" }),
    ).toBeVisible();
    await expect(
      bands.getByRole("button", { name: "Move to Free" }),
    ).toBeVisible();

    // Requirement in its own right: the billing surface loads with a clean
    // console, no page errors and no 5xx.
    expectClean(problems, "billing surface load");
  });

  test("a band switch hands off a well-formed signed checkout form, intercepted before PayFast", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    // Nothing in this test may reach PayFast: every request whose host is
    // under payfast.co.za is answered locally. Registered before any click so
    // there is no window in which a real submit could escape.
    let handoffCount = 0;
    await page.route(
      (url) => url.hostname.endsWith("payfast.co.za"),
      async (route) => {
        handoffCount += 1;
        await route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>intercepted by e2e</title>ok",
        });
      },
    );

    await gotoBilling(page, ws);

    // The amount asserted below is derived from the price the page DISPLAYS,
    // not re-read from plans.ts, so this test fails if the card and the form
    // ever quote different numbers.
    const bands = bandsSection(page);
    const priceText = await bands.locator('h3:text-is("Team") + p').innerText();
    const displayedRand = priceText.match(/R([\d\s ,]+)/)?.[1].replace(/\D/g, "");
    expect(displayedRand, `unparseable price: ${priceText}`).toBeTruthy();
    const expectedAmount = `${displayedRand}.00`;

    // No quote exists locally (no live mandate, proration off), so the switch
    // goes straight to checkout: POST to our API, then a form post to PayFast.
    const checkoutLanded = page.waitForResponse(
      (r) =>
        r.url().includes("/billing/checkout") &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    );
    const handedOff = page.waitForRequest(
      (r) => new URL(r.url()).hostname.endsWith("payfast.co.za"),
      { timeout: 30_000 },
    );
    // Everything from the click on runs under a finally that removes the
    // pending row the checkout POST writes, keyed to this workspace and this
    // moment. A row leaked on a failure would poison every later run with a
    // stale "waiting for PayFast" status. The 5s margin absorbs any skew
    // between this process's clock and the database's now().
    const testStart = new Date(Date.now() - 5_000);
    let formReference: string | undefined;
    let cleaned: string[] = [];
    try {
      await bands.getByRole("button", { name: "Switch to Team" }).click();
      const checkoutRes = await checkoutLanded;
      expect(
        checkoutRes.ok(),
        `checkout POST answered ${checkoutRes.status()}`,
      ).toBeTruthy();
      // Deliberately no checkoutRes.json(): the form submit navigates away
      // almost immediately and Chromium discards the response body with it.
      // The intercepted REQUEST below survives navigation, so the form is the
      // one source asserted on.

      const handoff = await handedOff;
      // The stub answered the navigation, so the intercept held and one, and
      // only one, submit was attempted.
      await page.waitForURL(/payfast\.co\.za/, { timeout: 30_000 });
      expect(handoffCount).toBe(1);
      const url = new URL(handoff.url());
      const body = handoff.postData() ?? "";

      // The hand-off is a plain form POST at the SANDBOX process endpoint.
      // Asserting the sandbox host is a real guard: www here would mean the
      // local env shadowing broke and a dev machine was aiming at live money.
      expect(handoff.method()).toBe("POST");
      expect(url.hostname).toBe("sandbox.payfast.co.za");
      expect(url.pathname).toBe("/eng/process");

      // The browser serialises hidden inputs in DOM order, and PayFast signs
      // that exact order, so the entry list IS the field order.
      const fields = Array.from(new URLSearchParams(body).entries());
      const names = fields.map(([name]) => name);
      const value = (name: string) => fields.find(([n]) => n === name)?.[1];

      // Our reference, present and in our format.
      formReference = value("m_payment_id");
      expect(formReference).toMatch(/^aw-/);
      // The amount charged is the amount displayed, first charge and recurring.
      expect(value("amount")).toBe(expectedAmount);
      expect(value("recurring_amount")).toBe(expectedAmount);
      expect(value("subscription_type")).toBe("1");
      // The signature signs everything before it, so it must come last.
      expect(names[names.length - 1]).toBe("signature");
      expect(value("signature")).toMatch(/^[a-f0-9]{32}$/);
      // No field appears twice; a duplicate would break the signed sequence.
      expect(new Set(names).size).toBe(names.length);
    } finally {
      // Runs on failure too; asserted outside the finally so a cleanup miss
      // cannot mask the original failure.
      cleaned = await cleanPendingSubscriptions(ws, testStart);
    }

    // Exactly one pending row existed, and it is the row whose reference the
    // form carried, which doubles as the server-side proof of the create.
    expect(cleaned, "pending subscription rows cleaned up").toHaveLength(1);
    expect(cleaned[0]).toBe(formReference);

    expectClean(problems, "checkout hand-off");
  });

  test("the cancellation dialog reassures, chips toggle, and Keep plan fires no DELETE", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    // Belt and braces: any DELETE toward the billing API is both recorded and
    // blocked. Recorded so the test can assert none fired; blocked so a
    // regression that DID fire one cannot drop the seeded workspace to Free
    // (with no active subscription a cancel here is immediate, no grace).
    const deletes: string[] = [];
    await page.route("**/api/**/billing", async (route) => {
      if (route.request().method() === "DELETE") {
        deletes.push(route.request().url());
        await route.abort();
        return;
      }
      await route.fallback();
    });

    await gotoBilling(page, ws);

    // With no subscription row the "Cancel subscription" button does not
    // render; the Free card's "Move to Free" opens the same dialog.
    await bandsSection(page)
      .getByRole("button", { name: "Move to Free" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Cancel subscription" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Cancel Studio?" }),
    ).toBeVisible();

    // What is kept: the work, stated plainly. (The "until <date>" variant
    // needs a paid-through period, which the seeded workspace does not have,
    // so the immediate-move copy is the one asserted here.)
    await expect(dialog.getByText(/move to Free/)).toBeVisible();
    await expect(dialog.getByText(/Nothing is deleted/)).toBeVisible();
    await expect(
      dialog.getByText(/projects, tasks and history all stay/),
    ).toBeVisible();
    // The soft off-ramp for a studio band: down, not out.
    await expect(
      dialog.getByRole("button", { name: "Switch to Team instead" }),
    ).toBeVisible();

    // Reason chips: single-select, click again to clear. Selection is styled
    // with text-accent, unselected chips carry text-muted.
    const expensive = dialog.getByRole("button", { name: "Too expensive" });
    const trying = dialog.getByRole("button", { name: "Just trying it out" });
    await expect(expensive).toHaveClass(/text-muted/);
    await expensive.click();
    await expect(expensive).toHaveClass(/text-accent/);
    await trying.click();
    await expect(trying).toHaveClass(/text-accent/);
    await expect(expensive).toHaveClass(/text-muted/);
    await trying.click();
    await expect(trying).toHaveClass(/text-muted/);

    // The soft exit closes the dialog and must not touch the API.
    await dialog.getByRole("button", { name: "Keep Studio" }).click();
    await expect(dialog).toBeHidden();
    expect(deletes, "DELETE requests fired from Keep plan").toEqual([]);

    // Still on Studio, the dialog changed nothing.
    await expect(
      page.getByRole("heading", { name: "Studio plan" }),
    ).toBeVisible();

    expectClean(problems, "cancellation dialog");
  });
});
