"use client";

/**
 * The one place the client decides "am I running inside the store shell?".
 *
 * It reads the SAME user agent marker the server reads (src/lib/shell.ts), so
 * client and server can never disagree about what mode the app is in: one
 * regex, one source of truth, already covered by tests/shell.test.ts. Sniffing
 * for `window.Capacitor` instead would drift the moment the marker changes.
 *
 * Everything below is a no-op on the web BY CONSTRUCTION: each entry point
 * checks the marker first, so the dynamic import of a Capacitor plugin never
 * even runs in a browser. Nothing in this module may be imported statically
 * from a component that renders on the web.
 */
import { shellPlatform, type ShellPlatform } from "@/lib/shell";

export function nativePlatform(): ShellPlatform | null {
  if (typeof navigator === "undefined") return null;
  return shellPlatform(navigator.userAgent);
}

export function isNativeShell(): boolean {
  return nativePlatform() !== null;
}

/**
 * Preferences key for the biometric app lock.
 *
 * @capacitor/preferences, not localStorage: a webview's localStorage is
 * clearable by the OS under storage pressure, and the lock silently turning
 * itself off is the one failure this feature must not have.
 *
 * NOT a secure store. Preferences is UserDefaults on iOS and a MODE_PRIVATE
 * SharedPreferences on Android, neither encrypted nor the Keychain. That is
 * fine for a "1", which is a preference and not a credential, and it is the
 * reason nothing secret may ever be added alongside it.
 */
const APP_LOCK_KEY = "aw-app-lock";

export async function appLockEnabled(): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: APP_LOCK_KEY });
    return value === "1";
  } catch {
    // A missing plugin must fail OPEN, not lock the user out of their work.
    return false;
  }
}

export async function setAppLockEnabled(on: boolean): Promise<void> {
  if (!isNativeShell()) return;
  const { Preferences } = await import("@capacitor/preferences");
  if (on) {
    await Preferences.set({ key: APP_LOCK_KEY, value: "1" });
  } else {
    await Preferences.remove({ key: APP_LOCK_KEY });
  }
}

export interface BiometryState {
  /** Biometry is present AND the user has enrolled in it. */
  available: boolean;
  /** "Face ID", "Touch ID", "Fingerprint"... for the toggle's label. */
  label: string;
  /** Why it is unavailable, already phrased for a human. */
  reason: string;
}

/** What kind of biometry this device offers, for labelling the toggle. */
export async function checkBiometry(): Promise<BiometryState> {
  if (!isNativeShell()) {
    return { available: false, label: "Biometrics", reason: "" };
  }
  try {
    const { BiometricAuth, BiometryType } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    const result = await BiometricAuth.checkBiometry();
    const labels: Record<number, string> = {
      [BiometryType.touchId]: "Touch ID",
      [BiometryType.faceId]: "Face ID",
      [BiometryType.fingerprintAuthentication]: "Fingerprint",
      [BiometryType.faceAuthentication]: "Face unlock",
      [BiometryType.irisAuthentication]: "Iris unlock",
    };
    return {
      available: result.isAvailable,
      label: labels[result.biometryType] ?? "Biometrics",
      reason: result.reason,
    };
  } catch {
    return {
      available: false,
      label: "Biometrics",
      reason: "Biometrics aren't available on this device.",
    };
  }
}

/**
 * Prompt for Face ID / Touch ID / fingerprint. Resolves true only on a real
 * success; every error path resolves false so callers cannot mistake a thrown
 * exception for a pass.
 *
 * `allowDeviceCredential` is on deliberately: a user whose finger is wet or
 * whose face is in the dark must still be able to reach their own work with
 * the device PIN, and the alternative is an app they cannot open.
 */
export async function verifyIdentity(reason: string): Promise<boolean> {
  if (!isNativeShell()) return true;
  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      androidTitle: "Unlock Alpha Workspace",
      androidSubtitle: reason,
    });
    return true;
  } catch {
    return false;
  }
}
