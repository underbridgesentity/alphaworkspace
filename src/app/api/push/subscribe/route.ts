import { z } from "zod";
import { eq } from "drizzle-orm";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import { pushSubscribeSchema } from "@/lib/validators";

export const POST = api(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, pushSubscribeSchema);
  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        lastSeenAt: new Date(),
      },
    });
  return json({ ok: true }, { status: 201 });
});

const unsubscribeSchema = z.object({ endpoint: z.url() });

export const DELETE = api(async (req) => {
  const user = await requireUser();
  const { endpoint } = await readJson(req, unsubscribeSchema);
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  void user;
  return json({ ok: true });
});
