/**
 * Detection for the Capacitor store shell ("commerce-free shell mode").
 *
 * The Play Store and App Store binaries load the live site in a webview and
 * append a marker to the webview's user agent: "AlphaShell/1 (android)" or
 * "AlphaShell/1 (ios)". When a request carries that marker, every purchasing
 * surface (prices, upgrade links, checkout, calls to action) must be stripped
 * SERVER-SIDE, because store reviewers inspect the rendered DOM; CSS hiding
 * does not satisfy Apple 3.1.3(f) or Play's billing policy.
 *
 * Dependency-free and environment-free on purpose: this is imported from
 * server components, the proxy (edge runtime) and unit tests alike.
 */

export type ShellPlatform = "android" | "ios";

/**
 * The marker is matched strictly (exact token, one space, parenthesised
 * platform) so an unrelated UA that merely mentions "AlphaShell" somewhere
 * cannot flip a browser into the stripped-down mode. The version digit is
 * allowed to grow: a v2 shell must not silently regain commerce surfaces.
 */
const MARKER = /(?:^|\s)AlphaShell\/\d+ \((android|ios)\)/;

export function shellPlatform(
  userAgent: string | null,
): ShellPlatform | null {
  if (!userAgent) return null;
  const m = MARKER.exec(userAgent);
  if (!m) return null;
  return m[1] as ShellPlatform;
}
