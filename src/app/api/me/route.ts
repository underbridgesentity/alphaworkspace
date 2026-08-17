import { z } from "zod";
import { eq } from "drizzle-orm";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { notificationPrefsSchema } from "@/lib/validators";
import { deleteAccount } from "@/server/dal/account";

/**
 * DELETE purges Supabase storage for every workspace that dies with the
 * account, plus every meeting the user recorded anywhere, before it drops the
 * rows that hold those paths.
 *
 * 60 because deleteObjects stops at its own 45s deadline and returns, so the
 * account delete always runs; dying mid-purge would leave the account
 * undeletable, which is the POPIA right this route exists for. A higher
 * ceiling would buy nothing (and is not plan-limited here: four other routes
 * ship 300 and deploy fine).
 *
 * Route config is per SEGMENT, so this ceiling covers GET and PATCH too. It
 * only bites if a handler actually runs that long, which neither does.
 */
export const maxDuration = 60;

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
