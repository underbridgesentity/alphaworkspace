"use client";

/**
 * Web push subscription helpers. Push is the primary nudge channel for our
 * Android-heavy market; subscription needs the service worker (production
 * builds, dev degrades gracefully).
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushStatus =
  | "unsupported"
  | "no-key"
  | "denied"
  | "subscribed"
  | "unsubscribed";

export async function pushStatus(): Promise<PushStatus> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unsupported";
  }
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "no-key";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

export async function subscribePush(): Promise<PushStatus> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "no-key";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
  });

  const body = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: body.keys?.p256dh, auth: body.keys?.auth },
      userAgent: navigator.userAgent.slice(0, 300),
    }),
  });
  return "subscribed";
}

export async function unsubscribePush(): Promise<PushStatus> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    // Kill the LOCAL subscription first and unconditionally, so an offline
    // sign-out still stops pushes landing on this (possibly shared) device
    // even when the server DELETE can't go through. The server row is pruned
    // on the next failed delivery anyway.
    try {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch {
      // offline / network down; the local unsubscribe below still runs
    }
    await sub.unsubscribe();
  }
  return "unsubscribed";
}
