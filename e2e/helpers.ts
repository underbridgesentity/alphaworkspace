import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared plumbing for the e2e specs. Lives here rather than in one spec so the
 * "no console error, no page error, no 5xx" contract is written once: a
 * journey that silently stopped watching for crashes is worse than no journey.
 */

/**
 * Noise from `next dev` itself, not from the app. The HMR socket cannot open
 * because Playwright browses 127.0.0.1 while the dev server expects localhost,
 * and it says nothing about whether the product works. Kept as a narrow list
 * rather than a broad filter, so a real websocket bug still fails the run.
 */
export const DEV_NOISE = [/_next\/webpack-hmr/, /Download the React DevTools/];

/** Console errors and 5xx/failed requests collected for the life of a page. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (DEV_NOISE.some((re) => re.test(text))) return;
    problems.push(`console: ${text.slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url().slice(0, 120)}`);
  });
  return problems;
}

/** Fails the test with the collected crashes, if any. Call at the very end. */
export function expectClean(problems: string[], where: string): void {
  expect(problems, `runtime problems during ${where}:\n${problems.join("\n")}`).toEqual([]);
}

/**
 * Crash-level only: page errors and 5xx, no console noise.


/** The seeded workspace slug, read once from wherever we land after sign-in. */
export async function workspaceSlug(page: Page): Promise<string> {
  await page.goto("/app");
  await page.waitForURL(/\/w\/[^/]+/, { timeout: 30_000 });
  const m = page.url().match(/\/w\/([^/?#]+)/);
  if (!m) throw new Error(`no workspace in url: ${page.url()}`);
  return m[1];
}

/**
 * A title no other run can collide with. The suite writes into the shared
 * seeded workspace, so a fixed string would make a second run assert against
 * the first run's leftovers, and a failed run would poison every run after it.
 * The "e2e" stem also makes stragglers obvious to a human reading the seed.
 */
export function unique(label: string): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `e2e ${label} ${stamp}`;
}

/**
 * Playwright's name matching goes through a regex for anything non-exact, and
 * our unique titles are safe, but the surrounding aria-labels are not.
 */
export function rx(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/**
 * The desktop sidebar is in the DOM but hidden on mobile, and the mobile tab
 * bar is in the DOM but hidden on desktop, so nearly every shell control
 * resolves to two nodes. Ask for the visible one.
 */
export function onlyVisible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/**
 * Runs `action` and waits for the POST it triggers to come back OK.
 *
 * Creates are optimistic: the card is on screen the instant you press Enter,
 * long before the row exists in Postgres. A test that ticks or drags that card
 * straight away PATCHes an id the server has never heard of, the mutation
 * rolls back, and the failure looks like a broken board instead of a race in
 * the test. So wait for the create to actually land.
 */
export async function awaitPost(
  page: Page,
  urlPart: string,
  action: () => Promise<void>,
): Promise<void> {
  const landed = page.waitForResponse(
    (r) => r.url().includes(urlPart) && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await action();
  const res = await landed;
  expect(res.ok(), `POST ${res.url()} answered ${res.status()}`).toBeTruthy();
}

/** Opens the first project on the projects index and waits for the board. */
export async function openFirstProject(page: Page, ws: string): Promise<void> {
  await page.goto(`/w/${ws}/projects`);
  // Scoped to main: the desktop sidebar lists the same projects and is in the
  // DOM on mobile too, just hidden, so an unscoped match waits on a link that
  // will never be visible.
  const link = page.locator(`main a[href^="/w/${ws}/p/"]`).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await page.waitForURL(/\/w\/[^/]+\/p\/[^/?#]+/, { timeout: 30_000 });
  // Columns are the board's own proof of arrival; the skeleton has no regions.
  await expect(page.getByRole("region", { name: "To do" })).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Adds a task to a board column through the column's own quick-add row. This
 * is the cheap deterministic create: no extraction round trip, so tests that
 * only need a task to exist do not also depend on the parser.
 */
export async function addTaskToColumn(
  page: Page,
  column: string,
  title: string,
): Promise<void> {
  const region = page.getByRole("region", { name: column });
  await region.getByRole("button", { name: "Add task" }).click();
  const input = region.getByLabel("New task title");
  await input.fill(title);
  await awaitPost(page, "/tasks", () => input.press("Enter"));
  await expect(region.getByText(title, { exact: true })).toBeVisible();
}

/**
 * Removes a task through the panel's own delete, so every journey leaves the
 * seeded workspace as it found it even when it created work along the way.
 */
export async function deleteTask(page: Page, title: string): Promise<void> {
  await page.getByText(title, { exact: true }).first().click();
  const panel = page.getByRole("dialog", { name: "Task details" });
  await panel.getByRole("button", { name: "Delete task" }).click();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
}
