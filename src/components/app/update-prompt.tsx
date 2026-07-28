"use client";

/**
 * "A newer version is ready."
 *
 * Page navigations are served stale-while-revalidate, so right after a deploy
 * the app paints the previous build and only picks up the new one on a later
 * visit. This is the quiet way out of that: the service worker says when the
 * copy on screen has been superseded (or a new worker is waiting), and we
 * offer a refresh. We never take one.
 *
 * Three rules it obeys:
 *  - it never interrupts. While a dialog is open (voice capture, the meeting
 *    recorder mid-record or mid-upload, quick add, the task panel) or while
 *    someone is typing, the update is held and re-checked, not shown.
 *  - it never nags. Dismiss it and it is gone for this page view.
 *  - it never strands anyone offline. Accepting can activate a worker whose
 *    activate step clears the old caches, so the offer only stands while
 *    there is a connection to refetch from.
 *
 * Queued offline writes survive the reload: they live in IndexedDB, and the
 * outbox replays them on mount, idempotently (client UUIDs, last write wins,
 * a replayed DELETE hitting 404 counts as done). A flush interrupted
 * mid-request replays at worst once more.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Held back until the person is plainly not in the middle of something. */
function busy(): boolean {
  if (!navigator.onLine) return true;
  if (document.visibilityState !== "visible") return true;
  if (document.querySelector("dialog[open]")) return true;
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

export function UpdatePrompt() {
  // "waiting": a new service worker is installed and needs to be let in.
  // "content": same worker, but the server is serving a newer build.
  const [update, setUpdate] = useState<"waiting" | "content" | null>(null);
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);
  const reloading = useRef(false);

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    // Captured now: a page that loads with no controller gets one the moment
    // the worker first claims it, and that is a normal first visit, not an
    // update.
    const hadController = !!sw.controller;

    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === "aw-update") {
        setUpdate((prev) => prev ?? "content");
      }
    };
    // Another tab let a new worker in. Ours is still running the old build,
    // and its caches have just been cleared, so it should refresh too, when
    // its own user is ready.
    const onController = () => {
      if (!reloading.current && hadController) setUpdate("content");
    };

    sw.addEventListener("message", onMessage);
    sw.addEventListener("controllerchange", onController);

    void sw.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting && hadController) setUpdate("waiting");
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && hadController) setUpdate("waiting");
        });
      });
    });

    return () => {
      sw.removeEventListener("message", onMessage);
      sw.removeEventListener("controllerchange", onController);
    };
  }, []);

  // Wait for a calm moment. The poll only runs between an update arriving and
  // the prompt appearing, then stops for good.
  useEffect(() => {
    if (!update || shown || gone) return;
    const check = () => {
      if (!busy()) setShown(true);
    };
    check();
    const id = window.setInterval(check, 4000);
    return () => window.clearInterval(id);
  }, [update, shown, gone]);

  const refresh = useCallback(() => {
    reloading.current = true;
    const reload = () => {
      if (!reloading.current) return;
      reloading.current = false;
      window.location.reload();
    };
    if (update !== "waiting") {
      reload();
      return;
    }
    void navigator.serviceWorker.getRegistration().then((reg) => {
      const waiting = reg?.waiting;
      if (!waiting) {
        reload();
        return;
      }
      // Let the new worker take over first, so the reload is served by it and
      // one refresh is genuinely enough.
      navigator.serviceWorker.addEventListener("controllerchange", reload, {
        once: true,
      });
      waiting.postMessage({ type: "aw-activate-update" });
      window.setTimeout(reload, 2500); // never leave the button dead
    });
  }, [update]);

  if (!shown || gone) return null;

  return (
    <div
      role="status"
      className="animate-fade-up fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-card bg-overlay py-3 pl-4 pr-2 shadow-e3 md:inset-x-auto md:bottom-6 md:right-6 md:mx-0"
    >
      <p className="min-w-0 flex-1 text-dense text-ink">A newer version is ready</p>
      {/* Negative margins buy a thumb-sized target without making the pill
          taller: the text stays on one line, the tap area is 38px. */}
      <button
        onClick={() => setGone(true)}
        className="press -my-2.5 shrink-0 px-2 py-2.5 text-dense text-muted hover:text-ink"
      >
        Later
      </button>
      <button
        onClick={refresh}
        className="press -my-2.5 shrink-0 px-2 py-2.5 text-dense font-semibold text-accent-quiet hover:text-accent-hover"
      >
        Refresh
      </button>
    </div>
  );
}
