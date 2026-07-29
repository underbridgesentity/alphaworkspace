import { test, expect } from "@playwright/test";
import { STATE } from "./paths";
import { expectClean, watch, workspaceSlug } from "./helpers";

/**
 * Every signed-in surface, opened for real and captured.
 *
 * This exists because the redesign shipped without anyone seeing it: the app
 * lives behind sign-in, so a curl check proves a route returns 200 and proves
 * nothing about whether the board, the tiles or the rails actually render. The
 * screenshots are the deliverable as much as the assertions.
 *
 * Each surface also asserts no console error and no failed request, which is
 * how a client-side crash gets caught rather than photographed.
 */
test.use({ storageState: STATE });

interface Surface {
  name: string;
  path: (ws: string) => string;
  /** Something that only exists once the page has really rendered. */
  ready: RegExp;
}

const SURFACES: Surface[] = [
  { name: "my-work", path: (w) => `/w/${w}`, ready: /my work/i },
  { name: "projects", path: (w) => `/w/${w}/projects`, ready: /projects/i },
  // "Pulse" is the h1 and is server rendered. The KPI tiles arrive from a
  // separate query, so waiting on them would be timing the dev server rather
  // than checking the page.
  { name: "dashboard", path: (w) => `/w/${w}/dashboard`, ready: /pulse/i },
  { name: "meetings", path: (w) => `/w/${w}/meetings`, ready: /meeting/i },
  { name: "settings", path: (w) => `/w/${w}/settings`, ready: /settings|workspace/i },
  { name: "members", path: (w) => `/w/${w}/settings/members`, ready: /member|invite/i },
  { name: "billing", path: (w) => `/w/${w}/settings/billing`, ready: /plan|band|billing/i },
];

test.describe("signed-in surfaces render", () => {
  for (const s of SURFACES) {
    test(s.name, async ({ page }, testInfo) => {
      const problems = watch(page);
      const ws = await workspaceSlug(page);

      await page.goto(s.path(ws));
      // Wait for real content, not just navigation, so the capture is settled.
      // visible:true matters: the desktop sidebar is in the DOM but hidden on
      // mobile, so .first() would otherwise latch onto a hidden nav link and
      // report a failure that says nothing about the page.
      await expect(
        page.getByText(s.ready).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
      // Entry animations are staggered; let them finish so a screenshot is not
      // a photograph of the arrival.
      await page.waitForTimeout(1200);

      await testInfo.attach(`${s.name}-${testInfo.project.name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });

      expectClean(problems, s.name);
    });
  }
});
