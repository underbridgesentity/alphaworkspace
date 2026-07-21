/**
 * The post-auth redirect guard. Every `next` / callback-url value passes
 * through this, so open-redirect attempts must resolve to null (callers then
 * fall back to /app), while genuine same-app paths pass through intact.
 */
import { describe, expect, it } from "vitest";
import { safeRelativePath } from "@/lib/safe-path";

describe("safeRelativePath", () => {
  it("passes genuine same-app paths through untouched", () => {
    for (const p of [
      "/app",
      "/app?plan=team",
      "/invite/abc-123",
      "/w/acme/settings/billing?plan=studio",
      "/account#password",
    ]) {
      expect(safeRelativePath(p)).toBe(p);
    }
  });

  it("rejects every open-redirect / off-site attempt", () => {
    for (const p of [
      "//evil.com",
      "/\\evil.com", // backslash-authority: browsers treat as //
      "/\\/evil.com",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "mailto:x@y.z",
      "evil.com",
      "",
      null,
      undefined,
    ]) {
      expect(safeRelativePath(p)).toBeNull();
    }
  });

  it("a decoded %5C backslash is still rejected", () => {
    expect(safeRelativePath(decodeURIComponent("/%5Cevil.com"))).toBeNull();
  });
});
