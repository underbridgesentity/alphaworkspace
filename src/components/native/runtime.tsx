"use client";

/**
 * Everything the store binaries do that a browser tab cannot.
 *
 * Loaded only inside the shell (see ./index.tsx), so nothing here needs a
 * platform check of its own beyond the per-platform branches. Each concern is
 * one hook, each hook cleans up after itself, and every plugin is imported
 * dynamically so a plugin missing from one platform degrades to nothing
 * instead of taking the app down.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { nativePlatform } from "@/lib/client/native";
import { emitSharedText } from "@/lib/client/share-intake";
import { safeRelativePath } from "@/lib/safe-path";
import { sharedTextFromUrl } from "@/lib/shell";
import { AppLock } from "./app-lock";

/** Matches --bg in globals.css for each theme; the bars must not seam. */
const BAR_LIGHT = "#fbfaf2";
const BAR_DARK = "#0b1215";

/**
 * The Android half of the share target, implemented as a local Capacitor
 * plugin (android/.../AlphaSharePlugin.java) because Capacitor's own bridge
 * only forwards intents that carry a URI, and ACTION_SEND carries its payload
 * in EXTRA_TEXT instead.
 *
 * Two ways in on purpose: `consumePendingShare` is a PULL, which is what a
 * cold start needs (the intent is handled long before React exists), and the
 * `shareReceived` event is a PUSH for a share arriving while the app is
 * already open. Neither can race the other because the pull clears the buffer.
 */
interface AlphaSharePlugin {
  consumePendingShare(): Promise<{ text: string | null }>;
  addListener(
    eventName: "shareReceived",
    listener: (data: { text: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const AlphaShare = registerPlugin<AlphaSharePlugin>("AlphaShare");

export function NativeRuntime() {
  useStatusBar();
  useSplashScreen();
  useBackButton();
  useExternalLinks();
  useShareTarget();
  useNativePush();

  return <AppLock />;
}

/* ------------------------------- status bar ------------------------------ */

/**
 * Keep the system bars in step with the in-app theme toggle. Without this the
 * status bar keeps the launch colour, so switching to dark leaves a bright
 * band above a dark app, which is the single most "this is a website" tell.
 */
function useStatusBar(): void {
  useEffect(() => {
    const platform = nativePlatform();
    let cancelled = false;

    const apply = async () => {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      if (cancelled) return;
      const dark = document.documentElement.dataset.theme === "dark";
      try {
        // Style.Dark means "dark background, light text", NOT "dark mode".
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        if (platform === "android") {
          // Android 15+ forces edge-to-edge, which would slide the app header
          // under the status bar. Opting out here (rather than padding with
          // env(safe-area-inset-top), which Android WebView reports only for
          // display cutouts) keeps one predictable layout on both platforms.
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({
            color: dark ? BAR_DARK : BAR_LIGHT,
          });
        }
      } catch {
        // Plugin unavailable on this build; the app is unaffected.
      }
    };

    void apply();

    // The theme toggle writes data-theme on <html>; watch it rather than
    // plumbing a callback through every place that can change the theme.
    const observer = new MutationObserver(() => void apply());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);
}

/* ------------------------------ splash screen ---------------------------- */

/**
 * Dismiss the splash as soon as React is on screen.
 *
 * The config still keeps launchAutoHide on with a generous duration, which is
 * the belt to this braces: the webview points at a remote origin, so on the
 * patchy connectivity this product is built for the page may never run any JS
 * at all, and a splash that only JS can dismiss would be a frozen app.
 */
function useSplashScreen(): void {
  useEffect(() => {
    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Auto-hide covers us.
      }
    })();
  }, []);
}

/* ------------------------------ back button ------------------------------ */

/**
 * Android's hardware back button. Unhandled, it closes the app from anywhere,
 * which loses a half-typed task and reads as a crash.
 *
 * Order matters: an open overlay is what "back" means when one is open, then
 * webview history, and only at the root does back exit. The dialog is closed
 * by dispatching its own `cancel` event rather than calling close() directly,
 * so React state unwinds through the component's normal path instead of
 * leaving a closed <dialog> that the app still believes is open.
 */
function useBackButton(): void {
  useEffect(() => {
    if (nativePlatform() !== "android") return;
    let handle: PluginListenerHandle | undefined;
    let cancelled = false;

    void (async () => {
      const { App } = await import("@capacitor/app");
      const listener = await App.addListener(
        "backButton",
        ({ canGoBack }) => {
          // Locked means locked: back must not navigate, exit, or reach past
          // the lock to close the overlay it is covering.
          if (document.querySelector("dialog[open][data-app-lock]")) return;

          const dialogs = document.querySelectorAll("dialog[open]");
          const top = dialogs[dialogs.length - 1];
          if (top instanceof HTMLDialogElement) {
            top.dispatchEvent(new Event("cancel", { cancelable: true }));
            return;
          }
          if (canGoBack && window.history.length > 1) {
            window.history.back();
            return;
          }
          void App.exitApp();
        },
      );
      if (cancelled) void listener.remove();
      else handle = listener;
    })();

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);
}

/* ----------------------------- external links ---------------------------- */

/**
 * Anything off our origin opens in the system browser.
 *
 * A UX point and a review point at once: an external site loaded inside the
 * app's own webview has no address bar, so the user cannot tell whose site
 * they are on, and both stores read that as the app misrepresenting content it
 * does not own. Capture phase so it wins before any component's own handler.
 *
 * mailto:, tel: and other schemes are left alone deliberately: Capacitor
 * already hands those to the OS, and intercepting them would break them.
 */
function useExternalLinks(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.host === window.location.host) return;

      event.preventDefault();
      void (async () => {
        try {
          const { Browser } = await import("@capacitor/browser");
          // Plugin defaults: a Custom Tab on Android, SFSafariViewController on
          // iOS. Both show the real address bar, which is the point.
          await Browser.open({ url: url.href });
        } catch {
          // Last resort: let the webview try, rather than a dead link.
          window.location.assign(url.href);
        }
      })();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

/* ------------------------------ share target ----------------------------- */

/**
 * Text shared into the app from another app's share sheet.
 *
 * Android arrives through the local AlphaShare plugin. iOS arrives as a
 * custom-scheme URL opened by the Share Extension (see
 * ios/SHARE_EXTENSION_SETUP.md), which Capacitor surfaces as `appUrlOpen`.
 * Both funnel into the same window event, and the app shell turns that into an
 * open quick-add dialog with the text prefilled.
 */
function useShareTarget(): void {
  useEffect(() => {
    const platform = nativePlatform();
    const handles: PluginListenerHandle[] = [];
    let cancelled = false;

    const track = (handle: PluginListenerHandle) => {
      if (cancelled) void handle.remove();
      else handles.push(handle);
    };

    void (async () => {
      if (platform === "android") {
        try {
          // Cold start: the intent was consumed by the plugin before this
          // page existed, so pull whatever it is holding.
          const pending = await AlphaShare.consumePendingShare();
          if (!cancelled) emitSharedText(pending.text);
          track(
            await AlphaShare.addListener("shareReceived", ({ text }) =>
              emitSharedText(text),
            ),
          );
        } catch {
          // Older binary without the plugin: sharing is simply unavailable.
        }
      }

      try {
        const { App } = await import("@capacitor/app");
        track(
          await App.addListener("appUrlOpen", ({ url }) => {
            const text = sharedTextFromUrl(url);
            if (text) emitSharedText(text);
          }),
        );
      } catch {
        // No @capacitor/app on this build.
      }
    })();

    return () => {
      cancelled = true;
      for (const handle of handles) void handle.remove();
    };
  }, []);
}

/* -------------------------------- push ----------------------------------- */

/**
 * Native push registration and notification taps.
 *
 * Registration happens on launch only for users who have ALREADY granted the
 * permission: the token rotates, so a returning user needs a fresh one on
 * every launch, but someone who has not opted in must not meet a system prompt
 * they did not ask for. The Account page's Enable button is the only thing
 * that prompts (see src/lib/client/native-push.ts).
 */
function useNativePush(): void {
  const router = useRouter();

  useEffect(() => {
    const handles: PluginListenerHandle[] = [];
    let cancelled = false;

    const track = (handle: PluginListenerHandle) => {
      if (cancelled) void handle.remove();
      else handles.push(handle);
    };

    void (async () => {
      try {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );
        const { registerNativeToken } = await import(
          "@/lib/client/native-push"
        );

        track(
          await PushNotifications.addListener("registration", (token) => {
            void registerNativeToken(token.value);
          }),
        );

        track(
          await PushNotifications.addListener(
            "pushNotificationActionPerformed",
            ({ notification }) => {
              // The payload's deep link is the same app-relative `url` the web
              // push channel sends, and it goes through safeRelativePath for
              // the same reason every redirect target does: a push payload is
              // input, and must not be able to navigate the app off-origin.
              const raw = notification.data?.url;
              const path = safeRelativePath(
                typeof raw === "string" ? raw : null,
              );
              router.push(path ?? "/app");
            },
          ),
        );

        const status = await PushNotifications.checkPermissions();
        if (status.receive === "granted" && !cancelled) {
          await PushNotifications.register();
        }
      } catch {
        // Push not built into this binary (no FCM/APNs config); the in-app
        // notification list still works.
      }
    })();

    return () => {
      cancelled = true;
      for (const handle of handles) void handle.remove();
    };
  }, [router]);
}
