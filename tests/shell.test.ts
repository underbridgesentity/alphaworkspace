import { describe, expect, it } from "vitest";
import { shellPlatform } from "@/lib/shell";

/**
 * The store-shell UA marker is the single switch that strips every commerce
 * surface, so both directions matter: the marker must be recognised inside a
 * real webview UA, and nothing that is not the marker may trip it. A false
 * positive would silently remove billing from a real browser; a false
 * negative would show prices to a store reviewer.
 */

const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 AlphaShell/1 (android)";

const IOS_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 AlphaShell/1 (ios)";

describe("shellPlatform", () => {
  it("detects the android shell marker inside a full webview UA", () => {
    expect(shellPlatform(ANDROID_WEBVIEW)).toBe("android");
  });

  it("detects the ios shell marker inside a full webview UA", () => {
    expect(shellPlatform(IOS_WEBVIEW)).toBe("ios");
  });

  it("detects the bare marker on its own", () => {
    expect(shellPlatform("AlphaShell/1 (android)")).toBe("android");
    expect(shellPlatform("AlphaShell/1 (ios)")).toBe("ios");
  });

  it("accepts future shell versions, which must stay commerce-free too", () => {
    expect(shellPlatform("AlphaShell/2 (android)")).toBe("android");
    expect(shellPlatform("AlphaShell/12 (ios)")).toBe("ios");
  });

  it("returns null when there is no user agent at all", () => {
    expect(shellPlatform(null)).toBeNull();
    expect(shellPlatform("")).toBeNull();
  });

  it("returns null for ordinary browser user agents", () => {
    expect(
      shellPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      ),
    ).toBeNull();
  });

  it("returns null for malformed or near-miss markers", () => {
    expect(shellPlatform("AlphaShell")).toBeNull();
    expect(shellPlatform("AlphaShell/1")).toBeNull();
    expect(shellPlatform("AlphaShell/ (android)")).toBeNull();
    expect(shellPlatform("AlphaShell/1 (windows)")).toBeNull();
    expect(shellPlatform("AlphaShell/1 android")).toBeNull();
    expect(shellPlatform("AlphaShell/1(ios)")).toBeNull();
    // Case matters: the shell sends the marker verbatim, so a lowercased
    // imitation is not the shell.
    expect(shellPlatform("alphashell/1 (ios)")).toBeNull();
    // The marker must be its own token, not a substring of something else.
    expect(shellPlatform("NotAlphaShell/1 (android)")).toBeNull();
  });
});
