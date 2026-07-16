import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import {
  listNotifications,
  markRead,
  unreadCount,
} from "@/server/dal/notifications";

export const GET = api(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const before = url.searchParams.get("before") ?? undefined;
  const [items, unread] = await Promise.all([
    listNotifications(db, user.id, { before }),
    unreadCount(db, user.id),
  ]);
  return json({ notifications: items, unread });
});

const markSchema = z.object({
  ids: z.union([z.literal("all"), z.array(z.uuid()).min(1).max(100)]),
});

export const POST = api(async (req) => {
  const user = await requireUser();
  const { ids } = await readJson(req, markSchema);
  await markRead(db, user.id, ids);
  return json({ ok: true });
});
