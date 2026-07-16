/**
 * NotificationService — the single entry point for telling humans something.
 *
 * Channel adapters live in ./channels/*. In-app always records; push and
 * email respect per-user preferences and sensible defaults. The service
 * batches rather than firehoses: due-soon/overdue arrive as one daily sweep,
 * not one ping per task.
 *
 * Product law: external channels are outbound nudges only — no notification
 * ever solicits a reply outside the app.
 */
import type { Db } from "@/server/db";
import { notifications, users } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import type { NotificationType } from "@/lib/types";
import { channelAdapters } from "./channels";
import { defaultChannelsFor } from "./defaults";

export interface NotifyInput {
  workspaceId: string;
  /** Recipients. The service drops the actor automatically. */
  userIds: string[];
  type: NotificationType;
  /** Rendered by each channel adapter; keep it small and structured. */
  payload: {
    title: string;
    body?: string;
    /** App-relative deep link, e.g. /w/acme/p/123?task=... */
    url?: string;
    [key: string]: unknown;
  };
  /** Who caused it — never notified about their own action. */
  actorId?: string | null;
}

export async function notify(db: Db, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(
    (id) => id && id !== input.actorId,
  );
  if (recipients.length === 0) return;

  const recipientUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      notificationPrefs: users.notificationPrefs,
    })
    .from(users)
    .where(inArray(users.id, recipients));

  for (const user of recipientUsers) {
    const channels = resolveChannels(input.type, user.notificationPrefs ?? {});
    const results: Record<string, string> = {};

    for (const channel of channels) {
      const adapter = channelAdapters[channel];
      if (!adapter) {
        results[channel] = "unavailable";
        continue;
      }
      try {
        const outcome = await adapter.send(db, user, input);
        results[channel] = outcome;
      } catch (err) {
        results[channel] = `error:${err instanceof Error ? err.message : "unknown"}`;
      }
    }

    // The in-app record is the source of truth and always written.
    await db.insert(notifications).values({
      userId: user.id,
      workspaceId: input.workspaceId,
      type: input.type,
      payload: input.payload,
      channels: results,
    });
  }
}

/** Delivery channels enabled for this user+type after quiet defaults. */
export function resolveChannels(
  type: NotificationType,
  prefs: Record<string, { inapp?: boolean; push?: boolean; email?: boolean }>,
): Array<"push" | "email"> {
  const defaults = defaultChannelsFor(type);
  const userPref = prefs[type] ?? {};
  return (["push", "email"] as const).filter((c) => userPref[c] ?? defaults[c]);
}
