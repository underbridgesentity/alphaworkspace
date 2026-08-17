import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * The proxy's branch structure, pinned. The /pricing shell redirect is an
 * EARLY return, and the danger a refactor could introduce is either widening
 * it (a prefix match would exempt /pricing-adjacent paths from the auth
 * bounce) or letting the shell branch swallow the session check for app
 * routes. Both directions are asserted here directly against proxy().
 */

const SHELL_UA = "Mozilla/5.0 (Linux; Android 14) AlphaShell/1 (android)";

function req(path: string, userAgent?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: userAgent ? { "user-agent": userAgent } : {},
  });
}

function redirectTarget(res: Response): string {
  return new URL(res.headers.get("location") ?? "").pathname;
}

describe("proxy", () => {
  it("redirects /pricing to /app for the store shell", () => {
    const res = proxy(req("/pricing", SHELL_UA));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(redirectTarget(res)).toBe("/app");
  });

  it("leaves /pricing public for ordinary browsers, no session bounce", () => {
    const res = proxy(req("/pricing", "Mozilla/5.0 (Macintosh) Chrome/126"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("still bounces a signed-out shell request on app routes to /sign-in", () => {
    for (const path of ["/w/acme", "/app", "/admin"]) {
      const res = proxy(req(path, SHELL_UA));
      expect(redirectTarget(res), path).toBe("/sign-in");
    }
  });

  it("matches /pricing exactly, so lookalike paths keep the auth bounce", () => {
    for (const path of ["/pricing/plans", "/pricinganything"]) {
      const res = proxy(req(path, SHELL_UA));
      expect(redirectTarget(res), path).toBe("/sign-in");
    }
  });
});

/**
 * Text shared in from another app is somebody's private message. It must not
 * be copied into the sign-in redirect, where it would land in a second URL, a
 * second set of access logs, and the browser history of a device that nobody
 * is even signed in on. Losing the share is the correct trade.
 */
describe("proxy and shared text", () => {
  it("strips ?share= from the sign-in destination", () => {
    const res = proxy(req("/app?share=call%20Sable%20about%20the%20invoice"));
    const next = new URL(res.headers.get("location") ?? "").searchParams.get(
      "next",
    );
    expect(next).toBe("/app");
    expect(res.headers.get("location")).not.toContain("Sable");
  });

  it("keeps every other parameter, so ?plan= still survives sign-in", () => {
    const res = proxy(req("/app?plan=team&share=secret%20message"));
    const next = new URL(res.headers.get("location") ?? "").searchParams.get(
      "next",
    );
    expect(next).toBe("/app?plan=team");
    expect(res.headers.get("location")).not.toContain("secret");
  });

  it("leaves a plain destination exactly as it was", () => {
    const res = proxy(req("/w/mzansi/p/abc?task=123"));
    const next = new URL(res.headers.get("location") ?? "").searchParams.get(
      "next",
    );
    expect(next).toBe("/w/mzansi/p/abc?task=123");
  });
});
