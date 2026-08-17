import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STATE } from "./paths";
import { watch, workspaceSlug } from "./helpers";

/**
 * Captures the App Store and Play screenshots from the real running product.
 *
 * Not a test of behaviour: a producer of deliverables that happens to fail if
 * the product is broken, which is exactly the property a marketing screenshot
 * should have. The alternative is a designer mocking up a screen that does not
 * exist, which is both a rejection risk and a lie.
 *
 * Sizes come from the device projects, so they cannot drift from what the
 * consoles demand:
 *   iphone  440x956  at dSF 3 -> 1320x2868  (App Store 6.9", the only iPhone
 *                                            set needed; supplying it makes
 *                                            6.5" optional)
 *   ipad   1032x1376 at dSF 2 -> 2064x2752  (App Store 13", mandatory while
 *                                            TARGETED_DEVICE_FAMILY is "1,2")
 *
 * Run: npx playwright test --project=iphone --project=ipad store-shots
 *
 * NO BILLING SURFACE IS CAPTURED, deliberately. The binaries ship commerce
 * free under Apple 3.1.3(f), and a screenshot showing a price would contradict
 * the review notes on the same submission.
 *
 * RESEED FIRST: `npm run db:reset:local`. The write journeys leave rows behind
 * with names like "e2e quick add ms78zmcljpbj", and those are legible in a
 * 2064px asset. A capture run against a database the journeys have touched
 * produces listing images with test litter in them.
 */
test.use({ storageState: STATE });

const OUT = path.join(__dirname, "..", "store", "assets", "screenshots");

interface Shot {
  name: string;
  path: (ws: string) => string;
  ready: RegExp;
}

/*
 * Readiness is matched INSIDE <main>, never page-wide. The sidebar carries the
 * same words as the page it links to, and on a phone it is display-none, so a
 * page-wide getByText("My Work").first() resolves to a hidden nav link and
 * waits forever on exactly the viewport the shot is for.
 */
const SHOTS: Shot[] = [
  // The phone layout leads with the brief rather than an "My Work" heading,
  // so accept either: this has to hold on both device projects.
  { name: "1-my-work", path: (w) => `/w/${w}`, ready: /morning brief|my work/i },
  { name: "2-projects", path: (w) => `/w/${w}/projects`, ready: /projects/i },
  { name: "3-dashboard", path: (w) => `/w/${w}/dashboard`, ready: /pulse/i },
  { name: "4-meetings", path: (w) => `/w/${w}/meetings`, ready: /meeting/i },
];

test.describe("store screenshots", () => {
  for (const shot of SHOTS) {
    test(shot.name, async ({ page }, testInfo) => {
      const problems = watch(page);
      const ws = await workspaceSlug(page);
      const device = testInfo.project.name;

      await page.goto(shot.path(ws));
      await expect(
        page.locator("main").getByText(shot.ready).first(),
      ).toBeVisible({ timeout: 30_000 });

      /*
       * Next's dev overlay renders into <nextjs-portal> and floats a badge over
       * the bottom-left corner, directly on top of the sidebar's Settings link.
       * It is invisible to every assertion and unmissable in a 2064px-wide
       * store asset. Hidden at capture time rather than disabled globally, so
       * the indicator keeps working for ordinary local development.
       */
      await page.addStyleTag({
        content: "nextjs-portal, [data-nextjs-dev-indicator] { display: none !important; }",
      });

      /*
       * Dismiss the first-run welcome card. On a freshly seeded database it
       * occupies the top third of the phone shot and pushes the actual product
       * below the fold, so the listing would lead with an onboarding panel
       * instead of the work. It is dismissed rather than hidden with CSS so
       * the layout reflows exactly as it does for a real user on day two.
       */
      const welcome = page.getByRole("button", { name: /dismiss welcome/i });
      if (await welcome.isVisible().catch(() => false)) {
        await welcome.click();
        await expect(welcome).toBeHidden();
      }

      // Let animated reveals settle; a screenshot caught mid-transition shows
      // half-faded content and reads as a rendering bug to a reviewer.
      await page.waitForTimeout(700);

      const dir = path.join(OUT, device);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: false });

      // Prove the file is the size the console demands, rather than trusting
      // the viewport maths. A wrong size is rejected on upload.
      const expected =
        device === "ipad"
          ? { w: 2064, h: 2752 }
          : { w: 1320, h: 2868 };
      const { width, height } = pngSize(file);
      expect(
        { width, height },
        `${device} shot must be exactly ${expected.w}x${expected.h}`,
      ).toEqual({ width: expected.w, height: expected.h });

      // A console error photographed into a store asset is worse than a
      // failing test, so the capture is only valid if the page was clean.
      expect(problems, `console/network errors during capture`).toEqual([]);
    });
  }
});

/** Reads width and height from a PNG's IHDR, no image library needed. */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
