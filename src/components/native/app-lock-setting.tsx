"use client";

/**
 * The Account page's app-lock toggle. Renders nothing outside the store shell,
 * where there is no biometry to offer.
 *
 * NOTE on the gate: this is the same UA marker useShell() reads, but read
 * client-side rather than from workspace context, because /account sits under
 * AppProviders WITHOUT a WorkspaceProvider, so useShell() would throw here.
 * One regex, one meaning, two readers.
 */
import { useCallback, useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import {
  appLockEnabled,
  checkBiometry,
  isNativeShell,
  setAppLockEnabled,
  verifyIdentity,
  type BiometryState,
} from "@/lib/client/native";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AppLockSetting() {
  const { toast } = useToast();
  const [native, setNative] = useState(false);
  const [biometry, setBiometry] = useState<BiometryState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  // Deferred a tick, the codebase's convention for reading external state (the
  // user agent, then the native Preferences store) and setting from it.
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!isNativeShell()) return;
      setNative(true);
      void Promise.all([checkBiometry(), appLockEnabled()]).then(
        ([state, on]) => {
          if (cancelled) return;
          setBiometry(state);
          setEnabled(on);
        },
      );
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setBusy(true);
    try {
      // Both directions ask. Turning it ON proves the user can get back in
      // before we ever lock them out; turning it OFF stops whoever is holding
      // an already-unlocked phone from quietly removing the lock.
      const ok = await verifyIdentity(
        next ? "Confirm to turn on the app lock" : "Confirm to turn it off",
      );
      if (!ok) {
        toast("Not confirmed, nothing changed");
        return;
      }
      await setAppLockEnabled(next);
      setEnabled(next);
      toast(next ? "App lock is on" : "App lock is off", {
        variant: "success",
      });
    } finally {
      setBusy(false);
    }
  }, [enabled, toast]);

  if (!native || !biometry) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold">App lock</h2>
      <p className="mt-0.5 text-xs text-faint">
        Your private tasks and meeting recordings live in here, and phones get
        handed around a studio.
      </p>

      <div className="mt-3 rounded-card bg-surface p-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-accent" />
          <p className="flex-1 text-sm">
            {!biometry.available
              ? (biometry.reason ||
                `${biometry.label} isn't set up on this device.`)
              : enabled
                ? `${biometry.label} is required after you switch away`
                : `Require ${biometry.label} to reopen the app`}
          </p>
          {biometry.available && (
            <Button
              size="sm"
              variant={enabled ? "ghost" : "quiet"}
              loading={busy}
              onClick={() => void toggle()}
            >
              {enabled ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
