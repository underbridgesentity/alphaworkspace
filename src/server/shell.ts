import "server-only";
import { headers } from "next/headers";
import { shellPlatform } from "@/lib/shell";

/**
 * Whether the current request came from the store shell (Capacitor webview).
 * Reads the incoming user agent, so it is request-scoped: server components,
 * layouts and route handlers can all call it. Using it opts the route into
 * dynamic rendering, which every gated surface already is (they sit behind
 * auth).
 */
export async function isShellRequest(): Promise<boolean> {
  const ua = (await headers()).get("user-agent");
  return shellPlatform(ua) !== null;
}

/**
 * Whether a third-party OAuth button may be rendered on this request.
 *
 * Two independent reasons it must be false inside the shell, either of which
 * alone would sink a release:
 *
 * 1. Google refuses its OAuth screen in an embedded webview and answers
 *    `disallowed_useragent`. A "Continue with Google" button in the store
 *    binaries is a button that cannot work, in front of every reviewer.
 * 2. Apple guideline 4.8: an app offering a third-party login service must
 *    also offer an equivalent private option. Magic link and password are the
 *    product's OWN account system, not a third-party service, so with Google
 *    gone the requirement to add Sign in with Apple does not arise at all.
 *
 * Gated server-side, exactly like the commerce surfaces: the button must not
 * exist in the DOM a reviewer inspects, not merely be hidden by CSS.
 */
export async function oauthAllowed(configured: boolean): Promise<boolean> {
  if (!configured) return false;
  return !(await isShellRequest());
}
