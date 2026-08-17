"use client";

/**
 * Mount point for everything that only exists inside the Capacitor shell.
 *
 * The gate is deliberately two-stage. `isNativeShell()` runs in an effect (so
 * the server render and the first client paint agree), and only then is the
 * runtime chunk fetched at all. On the web this component renders null, loads
 * nothing, and registers no listeners: the browser bundle never pays for the
 * native layer.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { isNativeShell } from "@/lib/client/native";

const NativeRuntime = dynamic(
  () => import("./runtime").then((m) => m.NativeRuntime),
  { ssr: false },
);

export function NativeLayer() {
  const [native, setNative] = useState(false);

  // Deferred a tick, the codebase's convention for reading external browser
  // state (here, the user agent) and then setting from it.
  useEffect(() => {
    const id = window.setTimeout(() => setNative(isNativeShell()), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!native) return null;
  return <NativeRuntime />;
}
