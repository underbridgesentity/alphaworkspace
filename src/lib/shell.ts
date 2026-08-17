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

/* ----------------------------- share target ------------------------------ */

/**
 * Query parameter that carries text shared INTO the app from the OS share
 * sheet. Named once here because three places have to agree on it: the native
 * share handlers, the /app entry redirect, and the app shell that consumes it.
 */
export const SHARE_PARAM = "share";

/** Matches the quick-add input's maxLength, so the two cannot disagree. */
export const MAX_SHARED_TEXT = 500;

/**
 * Characters that are stripped rather than collapsed. C0/C1 controls, the
 * zero-width family, and the bidi overrides: all of them can hide or reorder
 * what the reader sees in the confirm step, and quick-add's whole safety model
 * is that a human reads the text before a task is written from it.
 */
const INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060\ufeff]/g;

/**
 * Clean untrusted text arriving from another app's share sheet.
 *
 * Everything here is defence in depth for readability, NOT for injection: the
 * result is only ever assigned to a controlled React input's `value`, which
 * React escapes. Nothing may ever put this string into HTML, a URL it then
 * navigates to, or a template that is not React.
 *
 * Newlines collapse to spaces because quick-add is deliberately a one-liner
 * ("one line in, one structured task out"), and a pasted WhatsApp thread would
 * otherwise render as a single unreadable run in a single-line input.
 */
export function normalizeSharedText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.slice(0, MAX_SHARED_TEXT).trim();
}

/**
 * The custom scheme the iOS Share Extension uses to hand text to the app, and
 * the only deep link the shell accepts. Not a universal link: it never leaves
 * the device, so a private message does not travel through DNS or our logs on
 * its way from one app to another.
 */
const SHARE_SCHEME = "alphaworkspace:";

/**
 * Pull the payload out of `alphaworkspace://share?text=...`.
 *
 * Deliberately narrow: our scheme, the `share` route, the `text` parameter,
 * nothing else. Any app on the device can open our scheme, so this is a trust
 * boundary: a URL that is not exactly a share must not be able to steer the UI.
 */
export function sharedTextFromUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== SHARE_SCHEME) return null;

  // A custom scheme's first segment lands in `host` on some engines and in
  // `pathname` on others, so accept either spelling of "share". Anything
  // trailing it is rejected rather than ignored: `share/something` is not a
  // route we defined, and quietly treating it as one is how a second, unaudited
  // entry point appears later.
  const path = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const route = url.host ? (path === "" ? url.host : null) : path;
  if (route !== "share") return null;

  return normalizeSharedText(url.searchParams.get("text"));
}
