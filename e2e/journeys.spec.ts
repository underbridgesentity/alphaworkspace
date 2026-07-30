import { test, expect, type Locator, type Page } from "@playwright/test";
import { STATE } from "./paths";
import {
  addTaskToColumn,
  awaitPost,
  deleteTask,
  expectClean,
  onlyVisible,
  openFirstProject,
  unique,
  watch,
  workspaceSlug,
} from "./helpers";

/**
 * The journeys that MOVE DATA.
 *
 * surfaces.spec.ts proves the app renders; nothing there would notice if every
 * write in the product silently failed. These drive the real controls against
 * the real API and the seeded local database: create, complete, tick, drag,
 * search, and the two overlays people reach for on a phone.
 *
 * Every task and private item created here carries a unique title and is
 * deleted through the product's own delete, so a second run neither collides
 * with the first nor leaves junk behind in the seeded workspace.
 */
test.use({ storageState: STATE });

/** The account auth.setup.ts signs in as; used to find "me" in an assignee list. */
const OWNER = (process.env.E2E_EMAIL ?? "lerato@mzansi.studio").split("@")[0];

/**
 * Drives quick-add end to end and returns with `title` as the created task.
 *
 * The extraction engine is deliberately not asserted on: locally there is no
 * ANTHROPIC_API_KEY so the deterministic heuristic parses the line, but a
 * machine with a key set would get Claude, and a suite that only passes on one
 * of those is a suite that fails for the next person. So the review step
 * overwrites the parsed title with ours and pins the assignee by hand, which
 * is exactly what a user correcting a guess does anyway.
 */
async function quickAddAssignedToMe(page: Page, title: string): Promise<void> {
  await onlyVisible(page.getByRole("button", { name: /New task/ })).click();
  const dialog = page.getByRole("dialog", { name: "Quick add task" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Describe the task").fill("Draft the handover note");
  await dialog.getByRole("button", { name: "Parse into a task" }).click();

  // Extract, then SHOW, then confirm (product law 3): nothing exists yet.
  const titleField = dialog.getByLabel("Task 1 title");
  await expect(titleField).toBeVisible({ timeout: 30_000 });
  await titleField.fill(title);

  const project = dialog.getByLabel("Project");
  if (!(await project.inputValue())) {
    await project.selectOption(await firstRealOption(project));
  }
  await dialog
    .getByLabel("Assignee")
    .selectOption(await optionMatching(dialog.getByLabel("Assignee"), OWNER));

  await dialog.getByRole("button", { name: /Create task/ }).click();
  await expect(dialog).toBeHidden();
}

/** First option value that is neither the placeholder nor a sentinel. */
async function firstRealOption(select: Locator): Promise<string> {
  const value = await select
    .locator('option:not([value=""]):not([value="__new_project__"])')
    .first()
    .getAttribute("value");
  if (!value) throw new Error("no selectable option");
  return value;
}

/** Option value whose visible label contains `text`, case insensitive. */
async function optionMatching(select: Locator, text: string): Promise<string> {
  const value = await select
    .locator("option")
    .filter({ hasText: new RegExp(text, "i") })
    .first()
    .getAttribute("value");
  if (!value) throw new Error(`no option matching ${text}`);
  return value;
}

test.describe("journeys that write", () => {
  test("quick add creates a task and it lands on My Work", async ({ page }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("quick add");

    await page.goto(`/w/${ws}`);
    await expect(onlyVisible(page.getByText(/my work/i))).toBeVisible({
      timeout: 30_000,
    });

    await quickAddAssignedToMe(page, title);

    // My Work is "assigned to me, not done", so landing here is the proof the
    // write reached the database with the assignee we picked.
    await expect(page.getByText(title, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    expectClean(problems, "quick add");
    await deleteTask(page, title);
    expectClean(problems, "quick add");
  });

  test("the completion tick moves a card into Done", async ({ page }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("tick");

    await openFirstProject(page, ws);
    await addTaskToColumn(page, "To do", title);

    const tick = page.getByRole("button", { name: `Mark "${title}" complete` });
    await expect(tick).toHaveAttribute("aria-pressed", "false");
    await tick.click();

    await expect(
      page.getByRole("region", { name: "Done" }).getByText(title, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("region", { name: "To do" }).getByText(title, { exact: true }),
    ).toHaveCount(0);
    await expect(tick).toHaveAttribute("aria-pressed", "true");

    expectClean(problems, "completion tick");
    await deleteTask(page, title);
    expectClean(problems, "completion tick");
  });

  test("a private task takes a checklist step and reports its progress", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("private");

    await page.goto(`/w/${ws}`);
    const section = page.getByRole("region", { name: "Private tasks" });
    const add = section.getByLabel("Add a private task");
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.fill(title);
    await awaitPost(page, "/private-tasks", () => add.press("Enter"));

    const row = section.getByRole("button", { name: title, exact: true });
    await expect(row).toBeVisible();
    // The rolled-up figure before the step exists, so the assertion afterwards
    // is about this run's change rather than about whatever the seed contains.
    const ledger = section.getByText(/\d+ of \d+ done/);
    const before = await ledger.textContent();

    await row.click();
    const dialog = page.getByRole("dialog", { name: "Private task" });
    await dialog.getByRole("button", { name: "+ Add step" }).click();
    // "Add step" writes the `- [ ] ` syntax and leaves the caret after it, so
    // typing is what a user does next.
    await dialog.getByLabel("Note").pressSequentially("Collect the brief");
    // Blur turns the textarea back into the tickable rendering.
    await dialog.getByRole("heading", { name: "Private task" }).click();

    const step = dialog.getByRole("checkbox");
    await expect(step).not.toBeChecked();
    // Ticking must leave the checklist on screen. This previously bubbled to
    // the note wrapper and flipped the whole note into a raw textarea, so the
    // list you were ticking disappeared under you; the earlier version of this
    // test asserted that textarea, which meant it encoded the bug as expected
    // behaviour. Checking the box stays checked, in place, is the real contract.
    await step.check();
    await expect(step).toBeChecked();
    await expect(dialog.getByLabel("Note")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await expect(row.locator("..").getByTitle("Checklist: 1 of 1 done")).toBeVisible();
    await expect(ledger).toContainText(/\d+\/\d+ steps/);
    expect(await ledger.textContent()).not.toBe(before);

    await row.click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("button", { name: title, exact: true })).toHaveCount(0);
    expectClean(problems, "private checklist");
  });

  test("the board renders its columns and a card opens the task panel", async ({
    page,
  }) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("card");

    await openFirstProject(page, ws);
    for (const column of ["To do", "In progress", "Done"]) {
      await expect(page.getByRole("region", { name: column })).toBeVisible();
    }

    await addTaskToColumn(page, "To do", title);
    await page.getByText(title, { exact: true }).click();

    const panel = page.getByRole("dialog", { name: "Task details" });
    await expect(panel.getByLabel("Task title")).toHaveValue(title);
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    expectClean(problems, "board card");
    await deleteTask(page, title);
    expectClean(problems, "board card");
  });

  /**
   * Status change by drag, through dnd-kit's own keyboard sensor rather than
   * synthetic pointer moves. Pointer dragging a dnd-kit board under Playwright
   * needs a settling mousemove between grab and drop and still races the
   * collision pass, which is exactly the kind of test that passes on a laptop
   * and fails in CI. The keyboard sensor takes the same code path (sensor →
   * onDragOver → onDragEnd → PATCH) with no timing to lose, and it is the path
   * the board was deliberately built to support: Space picks up, arrows move,
   * Space drops.
   *
   * Desktop only: on mobile the columns stack into one vertical scroller and
   * the touch sensor wants a 180ms press-and-hold, which is a genuine
   * flakiness source rather than a coverage gap worth faking.
   */
  test("a card can be dragged to another column with the keyboard", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "columns stack on mobile");
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("drag");

    await openFirstProject(page, ws);
    await addTaskToColumn(page, "To do", title);

    const card = page.getByRole("button", { name: `Open task: ${title}` });
    await card.focus();
    await page.keyboard.press("Space");

    // ONE ArrowRight must cross into the next column, because that is what
    // the instructions read to a screen reader user promise. This used to take
    // two presses in a non-empty column (the stock coordinate getter resolved
    // to the closest sibling card first) and the earlier version of this test
    // looped presses until the announcement matched, which tolerated the bug.
    // dnd-kit's own live region is the authority, it is the same sentence a
    // screen reader user hears.
    const announcer = page.getByRole("status");
    await page.keyboard.press("ArrowRight");
    await expect(
      announcer.filter({ hasText: /is over In progress/ }),
    ).toHaveCount(1, { timeout: 3000 });
    await page.keyboard.press("Space");

    await expect(
      page
        .getByRole("region", { name: "In progress" })
        .getByText(title, { exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Survives a reload, so the move was persisted and not just optimistic.
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "In progress" })
        .getByText(title, { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    expectClean(problems, "keyboard drag");
    await deleteTask(page, title);
    expectClean(problems, "keyboard drag");
  });

  /**
   * The palette has to be closable on a phone, where there is no Escape key.
   * That was a real reported bug, which is why the Cancel button is asserted
   * on both viewports and Escape only where a keyboard exists.
   */
  test("search finds a task and the palette can be closed again", async ({
    page,
  }, testInfo) => {
    const problems = watch(page);
    const ws = await workspaceSlug(page);
    const title = unique("search");

    await openFirstProject(page, ws);
    await addTaskToColumn(page, "To do", title);

    await onlyVisible(page.getByRole("button", { name: /^Search/ })).click();
    const palette = page.getByRole("dialog", { name: "Search" });
    await expect(palette).toBeVisible();

    await palette.getByRole("textbox", { name: "Search" }).fill(title);
    await expect(palette.getByText(title, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await palette.getByRole("button", { name: "Close search" }).click();
    await expect(palette).toBeHidden();

    if (testInfo.project.name === "desktop") {
      await onlyVisible(page.getByRole("button", { name: /^Search/ })).click();
      await expect(palette).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(palette).toBeHidden();
    }

    expectClean(problems, "search palette");
    await deleteTask(page, title);
    expectClean(problems, "search palette");
  });

  test("the create FAB offers quick add and voice capture", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the FAB is the mobile bar");
    const problems = watch(page);
    const ws = await workspaceSlug(page);

    await page.goto(`/w/${ws}`);
    await page.getByRole("button", { name: "Create", exact: true }).click();

    const sheet = page.getByRole("dialog", { name: "Create" });
    await expect(sheet.getByRole("button", { name: /Quick add/ })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Voice capture/ })).toBeVisible();

    // Quick add is the one that can be opened without asking for a microphone.
    await sheet.getByRole("button", { name: /Quick add/ }).click();
    const dialog = page.getByRole("dialog", { name: "Quick add task" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    expectClean(problems, "create FAB");
  });
});
