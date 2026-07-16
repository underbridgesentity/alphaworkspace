import { z } from "zod";
import { eq } from "drizzle-orm";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { notificationPrefsSchema } from "@/lib/validators";
import { deleteAccount } from "@/server/dal/account";

export const GET = api(async () => {
  const user = await requireUser();
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      notificationPrefs: users.notificationPrefs,
    })
    .from(users)
    .where(eq(users.id, user.id));
  return json({ me: row });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});

export const PATCH = api(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, patchSchema);
  await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.notificationPrefs !== undefined
        ? { notificationPrefs: input.notificationPrefs }
        : {}),
    })
    .where(eq(users.id, user.id));
  return json({ ok: true });
});

/** POPIA: full account deletion. Blocked while owning a peopled workspace. */
export const DELETE = api(async () => {
  const user = await requireUser();
  await deleteAccount(db, user.id);
  return json({ ok: true });
});
