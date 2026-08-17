"use client";

/**
 * The channel that carries text shared INTO the app from the OS share sheet.
 *
 * A window event rather than a query parameter, for two reasons. It costs no
 * navigation, so a share arriving while the app is open opens quick-add
 * instantly instead of re-rendering a server component over 3G. And someone's
 * WhatsApp message never touches a URL, so it stays out of history, out of
 * referrers and out of server logs.
 *
 * The `?share=` parameter still exists as the cold entry point for platforms
 * that can only hand us a link (see SHARE_PARAM), and the app shell strips it
 * from the URL the moment it reads it.
 */
import { normalizeSharedText, SHARE_PARAM } from "@/lib/shell";

const SHARE_EVENT = "alpha:share";

/**
 * Fired by the native layer. Never fired on the web.
 *
 * The event is cancelable and the app shell's listener calls preventDefault(),
 * which is how this tells "somebody opened quick-add" from "nobody was
 * listening". Nobody is listening whenever the user happens to be on Account,
 * Admin or onboarding, none of which mount the app shell, and a share silently
 * vanishing there would be worse than the redirect.
 */
export function emitSharedText(raw: unknown): void {
  const text = normalizeSharedText(raw);
  if (!text || typeof window === "undefined") return;

  const handled = !window.dispatchEvent(
    new CustomEvent(SHARE_EVENT, { detail: text, cancelable: true }),
  );
  if (handled) return;

  // The long way round, through the cold entry point. This is the one path
  // where the text does travel in a URL, which is why the app shell strips the
  // parameter the moment it reads it.
  window.location.assign(
    `/app?${SHARE_PARAM}=${encodeURIComponent(text)}`,
  );
}

/**
 * Subscribe to shared text. Returns the unsubscribe function. The handler
 * running counts as handling it, see emitSharedText.
 */
export function onSharedText(handler: (text: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    // Re-normalised on the way in: this listener trusts nothing, because any
    // script on the page can dispatch an event by this name.
    const text = normalizeSharedText((event as CustomEvent<unknown>).detail);
    if (!text) return;
    event.preventDefault();
    handler(text);
  };
  window.addEventListener(SHARE_EVENT, listener);
  return () => window.removeEventListener(SHARE_EVENT, listener);
}
