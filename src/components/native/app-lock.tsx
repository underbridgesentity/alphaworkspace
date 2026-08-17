"use client";

/**
 * Biometric app lock.
 *
 * The product holds private tasks that admins cannot see and meeting
 * recordings of conversations people had in a room, on phones that get handed
 * around an agency studio all day. A device passcode protects the phone at the
 * front door; this protects the workspace behind it.
 *
 * The lock is armed the moment the app leaves the foreground, not on a timer,
 * because the threat is somebody picking the phone up while it is unlocked.
 * The overlay is rendered BEFORE the prompt is asked for, so the contents are
 * never on screen for the frame between resume and authentication.
 */
import { useEffect, useRef, useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import type { PluginListenerHandle } from "@capacitor/core";
import { appLockEnabled, verifyIdentity } from "@/lib/client/native";
import { Button } from "@/components/ui/button";

type Phase = "open" | "locked" | "prompting";

export function AppLock() {
  const [phase, setPhase] = useState<Phase>("open");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let handle: PluginListenerHandle | undefined;
    let cancelled = false;

    void (async () => {
      const { App } = await import("@capacitor/app");
      const listener = await App.addListener(
        "appStateChange",
        ({ isActive }) => {
          if (isActive) {
            // Ask only for a lock that was armed on the way out. Anything else
            // resuming (a permission sheet, the share sheet) must not prompt.
            setPhase((current) => (current === "locked" ? "prompting" : current));
            return;
          }
          // Arm on the way OUT so the very first painted frame on return is
          // already covered; arming on the way back in shows the workspace for
          // a frame first. The preference is re-read here rather than cached,
          // so flipping the toggle in Account takes effect immediately.
          void appLockEnabled().then((on) => {
            if (on) setPhase((current) => (current === "open" ? "locked" : current));
          });
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

  // "prompting" is the only thing that asks, so the button and the resume
  // path share one code path and cannot double-prompt. The overlay has already
  // painted by the time this runs.
  useEffect(() => {
    if (phase !== "prompting") return;
    let cancelled = false;
    void (async () => {
      const ok = await verifyIdentity("Unlock your workspace");
      // A refusal keeps the overlay up. There is no "skip": a lock with a way
      // past it is decoration, and the app switcher is still the way out.
      if (!cancelled) setPhase(ok ? "open" : "locked");
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  /**
   * A real <dialog> opened with showModal(), NOT a z-indexed div.
   *
   * The app's own overlays (task panel, quick-add, search) are native dialogs,
   * and showModal() promotes an element into the browser's top layer, which
   * sits above every z-index there is. A plain div would therefore paint
   * UNDERNEATH whatever was open when the phone was put down, leaking the exact
   * screen this feature exists to hide. Being in the top layer ourselves, and
   * opened last, is the only way to be on top. It also brings a real focus trap
   * and background inertness for free.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (phase !== "open" && !el.open) el.showModal();
    if (phase === "open" && el.open) el.close();
  }, [phase]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Escape, and Android's back button, must not dismiss the lock. This is
    // the opposite of every other dialog in the app, on purpose.
    const onCancel = (event: Event) => event.preventDefault();
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      // Read by the hardware-back handler in ./runtime.tsx, which must not
      // treat "back" as "close the thing behind the lock".
      data-app-lock=""
      aria-label="Workspace locked"
      // Fully opaque, including the backdrop: a blur would still leak the
      // shape and colour of the screen behind it.
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-bg text-ink backdrop:bg-bg"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-5 px-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-raised text-accent">
          <Lock className="size-7" />
        </span>
        <div>
          <p className="text-lg font-semibold tracking-tight">
            Workspace locked
          </p>
          <p className="mt-1 text-sm text-muted">
            Unlock to get back to your work.
          </p>
        </div>
        <Button
          size="lg"
          loading={phase === "prompting"}
          onClick={() => setPhase("prompting")}
        >
          <Fingerprint className="size-4.5" />
          Unlock
        </Button>
      </div>
    </dialog>
  );
}
