/**
 * User-facing notification reads. User-scoped rather than workspace-scoped:
 * the bell shows everything for you across workspaces you belong to.
 */
import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import type { Db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import type { NotificationDTO } from "@/lib/types";

export async function listNotifications(
  db: Db,
  userId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<NotificationDTO[]> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        opts.before ? lt(notifications.createdAt, new Date(opts.before)) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((n) => ({
    id: n.id,
    type: n.type as NotificationDTO["type"],
    payload: n.payload,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    workspaceId: n.workspaceId,
  }));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markRead(
  db: Db,
  userId: string,
  ids: string[] | "all",
): Promise<void> {
  const now = new Date();
  if (ids === "all") {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return;
  }
  for (const id of ids) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }
}
