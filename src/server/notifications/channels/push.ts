/**
 * Push channel. Primary nudge for our Android-heavy market, PWA push works
 * well there and costs the user no data plan surprises.
 *
 * ONE channel, two transports: browsers and the installed PWA are reached by
 * VAPID web push, the store binaries by FCM. They fan out from here rather
 * than being separate channels because the user's preference is "push", not
 * "push, but only on the transport they happened to be using when they ticked
 * the box" -- and most people run both, a laptop browser and a phone app.
 */
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import { nativePushTokens, pushSubscriptions } from "@/server/db/schema";
import { fcmConfigured, sendFcm } from "./fcm";
import type { ChannelAdapter } from "./index";

let configured: boolean | null = null;

/**
 * Hard ceiling on device fan-out per recipient. The registration endpoint caps
 * rows at 10, so in practice this is never reached; it exists because this
 * side of the wire is the one that blocks a user's write, and a bound enforced
 * only at the write path is a bound that a future migration or a manual insert
 * can walk straight past.
 */
const NATIVE_FANOUT_LIMIT = 12;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:alpha@example.com",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export const pushChannel: ChannelAdapter = {
  async send(db: Db, user, input) {
    const payload = {
      title: input.payload.title,
      body: input.payload.body ?? "",
      url: input.payload.url ?? "/",
      type: input.type,
    };

    const [web, native] = await Promise.all([
      sendWeb(db, user.id, payload),
      sendNative(db, user.id, payload),
    ]);

    const sent =
      (typeof web === "number" ? web : 0) +
      (typeof native === "number" ? native : 0);
    if (sent > 0) return `sent:${sent}`;
    // The three no-delivery cases stay distinct because they mean different
    // things to whoever reads the notification row later: a missing key is a
    // deployment fact, no devices is a user fact, and a failure is a bug.
    if (web === "failed" || native === "failed") return "failed";
    if (web === "no-devices" || native === "no-devices") {
      return "skipped:no-subscriptions";
    }
    return "skipped:not-configured";
  },
};

interface PushPayload {
  title: string;
  body: string;
  url: string;
  type: string;
}

/** Deliveries made, or why none were. */
type TransportResult = number | "not-configured" | "no-devices" | "failed";

async function sendWeb(
  db: Db,
  userId: string,
  payload: PushPayload,
): Promise<TransportResult> {
  if (!ensureConfigured()) return "not-configured";

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return "no-devices";

  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
        { TTL: 60 * 60 * 12, urgency: "normal" },
      );
      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Subscription expired, prune it.
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
  return sent > 0 ? sent : "failed";
}

async function sendNative(
  db: Db,
  userId: string,
  payload: PushPayload,
): Promise<TransportResult> {
  if (!fcmConfigured()) return "not-configured";

  const tokens = await db
    .select()
    .from(nativePushTokens)
    // Bounded independently of the endpoint's own cap: notify() is awaited
    // INSIDE the mutation that triggered it, so the number of blocking HTTPS
    // round-trips to Google has to be bounded at the point where it costs a
    // user their write, not only where the rows are created.
    .limit(NATIVE_FANOUT_LIMIT)
    .where(eq(nativePushTokens.userId, userId));
  if (tokens.length === 0) return "no-devices";

  // In parallel, not sequentially: one slow device should not add its latency
  // to every other device's.
  const outcomes = await Promise.all(
    tokens.map(async (row) => ({ row, outcome: await sendFcm(row.token, payload) })),
  );

  const dead = outcomes
    .filter((r) => r.outcome === "unregistered")
    .map((r) => r.row.id);
  if (dead.length > 0) {
    // App uninstalled or token rotated; the same pruning web push does.
    await db.delete(nativePushTokens).where(inArray(nativePushTokens.id, dead));
  }

  const sent = outcomes.filter((r) => r.outcome === "sent").length;
  return sent > 0 ? sent : "failed";
}
