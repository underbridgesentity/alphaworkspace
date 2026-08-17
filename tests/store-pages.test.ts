import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import sitemap from "@/app/sitemap";
import { SUPPORT_EMAIL } from "@/lib/contact";

/**
 * The two marketing pages both app stores check by hand, pinned.
 *
 * Apple requires a working Support URL on every listing and opens it. Google
 * Play requires the account-deletion URL to be reachable WITHOUT signing in,
 * and a reviewer who lands on a sign-in screen fails the listing. Neither
 * failure shows up in a build or a type check, so it is asserted here:
 *
 *  - /support and /delete-account must not be swept into the proxy's auth
 *    matcher (which is an allowlist of PROTECTED paths, so the danger is a
 *    future prefix pattern quietly covering them);
 *  - both must publish a reachable support address;
 *  - /delete-account must point a signed-in reader at the real control.
 */

const ROOT = path.resolve(__dirname, "..");
const SUPPORT_PAGE = path.join(ROOT, "src/app/(marketing)/support/page.tsx");
const DELETE_PAGE = path.join(
  ROOT,
  "src/app/(marketing)/delete-account/page.tsx",
);
const PRIVACY_PAGE = path.join(ROOT, "src/app/(marketing)/privacy/page.tsx");

/** Next matcher syntax, reduced to what this codebase actually uses. */
function matcherRegex(pattern: string): RegExp {
  const literal = pattern.replace(/\/:[A-Za-z]+\*$/, "");
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = pattern.endsWith("*") ? "(?:/.*)?" : "";
  return new RegExp(`^${escaped}${tail}$`);
}

function proxyGuards(pathname: string): boolean {
  return config.matcher.some((m) => matcherRegex(m).test(pathname));
}

describe("store-required marketing pages", () => {
  it("leaves /support and /delete-account outside the auth matcher", () => {
    for (const pathname of ["/support", "/delete-account"]) {
      expect(proxyGuards(pathname), pathname).toBe(false);
    }
  });

  it("still guards the routes the matcher is there for", () => {
    for (const pathname of [
      "/app",
      "/account",
      "/account/anything",
      "/w/acme",
      "/admin/plans",
    ]) {
      expect(proxyGuards(pathname), pathname).toBe(true);
    }
  });

  it("publishes one shared support address on every page that promises one", () => {
    // All three must render a mailto, and all three must take the address from
    // the shared constant rather than hard-coding their own. Three local
    // copies is how one of them ends up stale, pointing a store listing at a
    // mailbox nobody reads.
    for (const file of [SUPPORT_PAGE, DELETE_PAGE, PRIVACY_PAGE]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("mailto:${SUPPORT_EMAIL}");
      expect(src, `${file} must import the shared address`).toContain(
        'from "@/lib/contact"',
      );
      expect(src, `${file} must not hard-code an address`).not.toMatch(
        /const SUPPORT_EMAIL\s*=\s*"/,
      );
    }
  });

  it("the shared support address is a plausible, reachable mailbox", () => {
    // Apple emails this during review, so a placeholder here fails a
    // submission rather than a build.
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
    expect(SUPPORT_EMAIL).not.toMatch(/example|test|localhost|invalid|todo/i);
  });

  it("sends a signed-in reader from /delete-account to the real control", () => {
    const src = readFileSync(DELETE_PAGE, "utf8");
    expect(src).toContain('href="/account"');
  });

  it("lists both pages in the sitemap", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(urls).toContain("/support");
    expect(urls).toContain("/delete-account");
  });
});
