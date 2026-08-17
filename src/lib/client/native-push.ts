"use client";

/**
 * Native push (FCM / APNs), the shell's counterpart to web push.
 *
 * Deliberately the SAME PushStatus vocabulary as src/lib/client/push.ts, so
 * the Account page's enable/disable UI needs no idea which one it is talking
 * to. push.ts delegates here when the shell marker is present; on the web
 * nothing in this file is ever reached.
 */
import { nativePlatform } from "./native";
import type { PushStatus } from "./push";

/**
 * Where the device token is parked between `register()` returning it on the
 * `registration` event and the user turning push on. Module scope, not
 * storage: it is only useful for this process, and it is a credential.
 */
let lastToken: string | null = null;

/** Post a device token to the server. Safe to call repeatedly. */
export async function registerNativeToken(token: string): Promise<void> {
  const platform = nativePlatform();
  if (!platform || !token) return;
  lastToken = token;
  try {
    await fetch("/api/push/native", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        platform,
        userAgent: navigator.userAgent.slice(0, 300),
      }),
    });
  } catch {
    // Offline. The next launch registers again, tokens are idempotent.
  }
}

export async function nativePushStatus(): Promise<PushStatus> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    if (status.receive === "denied") return "denied";
    return status.receive === "granted" ? "subscribed" : "unsubscribed";
  } catch {
    return "unsupported";
  }
}

export async function subscribeNativePush(): Promise<PushStatus> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.requestPermissions();
    if (status.receive !== "granted") {
      return status.receive === "denied" ? "denied" : "unsubscribed";
    }
    // register() answers asynchronously on the `registration` event, which the
    // native runtime is already listening to and which POSTs the token. This
    // only has to ask.
    await PushNotifications.register();
    return "subscribed";
  } catch {
    return "unsupported";
  }
}

/**
 * Turn native push off for this device.
 *
 * Mirrors unsubscribePush() including the part that matters most: the LOCAL
 * teardown happens first and unconditionally, so an offline sign-out still
 * stops pushes landing on this (possibly shared) device. Studio phones get
 * handed around, and "Lerato signed out in a dead spot" must not leave Thabo
 * reading her task notifications on the lock screen.
 *
 * unregister() is what actually does it: it deletes the Firebase token on
 * Android and unregisters APNs on iOS, so the token the server still holds
 * stops resolving and FCM answers UNREGISTERED on the next send, which is what
 * prunes the row server-side even when this DELETE never got through.
 */
export async function unsubscribeNativePush(): Promise<PushStatus> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
  } catch {
    // Plugin missing; the server DELETE below is then the only lever.
  }

  // Best effort, and deliberately second: `lastToken` is only populated once
  // the `registration` event has fired this session, so it can be null here
  // and the local teardown above must not depend on it.
  const token = lastToken;
  lastToken = null;
  if (token) {
    try {
      await fetch("/api/push/native", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Offline; unregister() above already stopped delivery to this device.
    }
  }

  // The plugin's listeners are left alone on purpose: they also carry the
  // notification-tap deep link, and tearing them down here would break
  // opening a task from a notification for the rest of the session.
  return "unsubscribed";
}
