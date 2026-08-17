import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google sign-in must not exist in the DOM inside the store shell.
 *
 * Two independent failures ride on this one boolean, either of which sinks a
 * release on its own:
 *
 *   Google answers `disallowed_useragent` to OAuth attempted from an embedded
 *   webview, so the button in the store binaries is a button that cannot work,
 *   in front of every reviewer who taps it.
 *
 *   Apple guideline 4.8 requires an equivalent private login option alongside
 *   any third-party login service. Magic link and password are the product's
 *   OWN account system rather than a third-party service, so with Google gone
 *   the requirement to also ship Sign in with Apple never arises.
 *
 * Gated server-side for the same reason the commerce surfaces are: reviewers
 * inspect the rendered DOM, and CSS hiding is not removal.
 */

const ANDROID_SHELL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 AlphaShell/1 (android)";

const IOS_SHELL =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 AlphaShell/1 (ios)";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** The user agent the mocked request carries; set per test. */
let userAgent: string | null = null;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(userAgent ? { "user-agent": userAgent } : {}),
}));

const { isShellRequest, oauthAllowed } = await import("@/server/shell");

beforeEach(() => {
  userAgent = null;
});

describe("isShellRequest", () => {
  it("is true for both store platforms", async () => {
    userAgent = ANDROID_SHELL;
    expect(await isShellRequest()).toBe(true);
    userAgent = IOS_SHELL;
    expect(await isShellRequest()).toBe(true);
  });

  it("is false for a browser, and for a request with no user agent", async () => {
    userAgent = CHROME;
    expect(await isShellRequest()).toBe(false);
    userAgent = null;
    expect(await isShellRequest()).toBe(false);
  });
});

describe("oauthAllowed", () => {
  it("drops Google inside the shell even when it is fully configured", async () => {
    userAgent = ANDROID_SHELL;
    expect(await oauthAllowed(true)).toBe(false);
    userAgent = IOS_SHELL;
    expect(await oauthAllowed(true)).toBe(false);
  });

  it("keeps Google on the web, which is the only place it works", async () => {
    userAgent = CHROME;
    expect(await oauthAllowed(true)).toBe(true);
  });

  it("stays false when Google is not configured, on either surface", async () => {
    userAgent = CHROME;
    expect(await oauthAllowed(false)).toBe(false);
    userAgent = ANDROID_SHELL;
    expect(await oauthAllowed(false)).toBe(false);
  });

  it("does not trip on a user agent that merely mentions the marker", async () => {
    // The same strictness shellPlatform() is tested for, asserted at the gate
    // that actually consumes it: a near miss must leave Google in place rather
    // than silently removing a working sign-in path for real browsers.
    userAgent = `${CHROME} NotAlphaShell/1 (android)`;
    expect(await oauthAllowed(true)).toBe(true);
  });
});
