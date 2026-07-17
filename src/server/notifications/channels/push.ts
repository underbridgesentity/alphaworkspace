/**
 * Web push channel (VAPID). Primary nudge for our Android-heavy market,
 * PWA push works well there and costs the user no data plan surprises.
 */
import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import type { ChannelAdapter } from "./index";

let configured: boolean | null = null;

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
    if (!ensureConfigured()) return "skipped:not-configured";

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));
    if (subs.length === 0) return "skipped:no-subscriptions";

    const body = JSON.stringify({
      title: input.payload.title,
      body: input.payload.body ?? "",
      url: input.payload.url ?? "/",
      type: input.type,
    });

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
    return sent > 0 ? `sent:${sent}` : "failed";
  },
};
