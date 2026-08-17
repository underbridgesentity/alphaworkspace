import { test, expect } from "@playwright/test";
import { STATE } from "./paths";
import { expectClean, watch, workspaceSlug } from "./helpers";

/**
 * The iPad audit, and the source of the App Store's iPad screenshots.
 *
 * The iOS binary declares TARGETED_DEVICE_FAMILY "1,2", and Apple reviews on
 * every family a binary claims. Until this file, nothing had ever looked at the
 * layout between phone width and desktop: the shell is a webview, so "iPad
 * support" means the responsive layout holding up at tablet widths, and a
 * tablet is exactly where a phone-first layout tends to fall apart, stranding
 * a phone column in the middle of a wide screen.
 *
 * Runs in the "ipad" project only (1032x1376 at dSF 2, the iPad Pro 13"
 * viewport), so `--project=ipad` is required.
 */
test.use({ storageState: STATE });

interface Surface {
  name: string;
  path: (ws: string) => string;
  ready: RegExp;
}

const SURFACES: Surface[] = [
  { name: "my-work", path: (w) => `/w/${w}`, ready: /my work/i },
  { name: "board", path: (w) => `/w/${w}/projects`, ready: /projects/i },
  { name: "dashboard", path: (w) => `/w/${w}/dashboard`, ready: /pulse/i },
  { name: "meetings", path: (w) => `/w/${w}/meetings`, ready: /meeting/i },
  { name: "settings", path: (w) => `/w/${w}/settings`, ready: /settings|workspace/i },
];

/** Horizontal overflow: the single most common tablet-layout failure. */
async function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    // Name the widest offender so a failure is actionable rather than a number.
    widest: (() => {
      let worst = { tag: "", width: 0 };
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.right > worst.width) {
          worst = {
            tag: `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 60)}`,
            width: Math.round(r.right),
          };
        }
      }
      return worst;
    })(),
  }));
}

test.describe("iPad layout", () => {
  for (const s of SURFACES) {
    test(`${s.name} holds up at tablet width`, async ({ page }, testInfo) => {
      const problems = watch(page);
      const ws = await workspaceSlug(page);

      await page.goto(s.path(ws));
      await expect(page.getByText(s.ready).first()).toBeVisible({ timeout: 30_000 });

      // The desktop sidebar takes over at Tailwind's md (768px), so at 1032 an
      // iPad must get the sidebar and NOT the phone tab bar. Getting both, or
      // neither, is the tablet failure mode worth catching.
      const sidebar = page.locator("nav").first();
      await expect(sidebar).toBeVisible();

      const o = await overflow(page);
      expect(
        o.scrollWidth,
        `horizontal overflow: widest element is ${o.widest.tag} reaching ${o.widest.width}px`,
      ).toBeLessThanOrEqual(o.clientWidth + 1);

      await testInfo.attach(`ipad-${s.name}.png`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      expectClean(problems, `${s.name} on iPad`);
    });
  }

  test("landscape does not strand content in a narrow column", async ({ page }) => {
    const ws = await workspaceSlug(page);
    await page.setViewportSize({ width: 1376, height: 1032 });
    await page.goto(`/w/${ws}`);
    await expect(page.getByText(/my work/i).first()).toBeVisible({ timeout: 30_000 });

    // A phone-first layout on a wide screen often centres a ~600px column and
    // leaves the rest empty. The main region should use the width it is given.
    const main = page.locator("main").first();
    const box = await main.boundingBox();
    expect(box, "no <main> found").not.toBeNull();
    expect(
      box!.width,
      `main is only ${Math.round(box!.width)}px of a 1376px viewport`,
    ).toBeGreaterThan(700);
  });
});
