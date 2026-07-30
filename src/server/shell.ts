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
