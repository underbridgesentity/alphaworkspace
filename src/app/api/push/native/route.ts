import { and, desc, eq, notInArray } from "drizzle-orm";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError } from "@/server/dal/errors";
import { db } from "@/server/db";
import { nativePushTokens } from "@/server/db/schema";
import { nativePushDeleteSchema, nativePushSchema } from "@/lib/validators";

/**
 * Device tokens for the store shell, the sibling of /api/push/subscribe.
 * Same contract as that route on purpose: session-scoped, upsert on the unique
 * credential, and a delete that can only ever reach your own row.
 */

/**
 * Most people carry one phone; a few carry a phone and a tablet. The cap is
 * generous against that and still bounds the damage from the two things this
 * table is otherwise open to: unbounded rows per user, and a notification
 * fan-out that does one blocking HTTPS round-trip per row INSIDE the mutation
 * that triggered it. Without a cap, a member could register thousands of junk
 * tokens and every task assigned to them would then time out the assigner's
 * write, after that write had already committed.
 */
const MAX_TOKENS_PER_USER = 10;

export const POST = api(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, nativePushSchema);

  // A device re-registers on every launch, so the honest ceiling is still low.
  if (!checkRateLimit(`push-native:${user.id}`, 10, 60_000)) {
    throw new RateLimitError("Too many device registrations, give it a minute");
  }

  await db
    .insert(nativePushTokens)
    .values({
      userId: user.id,
      token: input.token,
      platform: input.platform,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: nativePushTokens.token,
      set: {
        // A token can be reassigned to a different user by the OS when an
        // account changes on a shared device, so the owner is rewritten too,
        // exactly as the web push route does.
        userId: user.id,
        platform: input.platform,
        lastSeenAt: new Date(),
      },
    });

  // Evict the oldest beyond the cap. Done after the upsert so the token just
  // registered is always among the survivors, and expressed as "delete what is
  // not in the newest N" rather than "delete older than T" so that a clock
  // skew can never drop the device that is actually in use.
  const keep = await db
    .select({ id: nativePushTokens.id })
    .from(nativePushTokens)
    .where(eq(nativePushTokens.userId, user.id))
    .orderBy(desc(nativePushTokens.lastSeenAt))
    .limit(MAX_TOKENS_PER_USER);
  if (keep.length === MAX_TOKENS_PER_USER) {
    await db
      .delete(nativePushTokens)
      .where(
        and(
          eq(nativePushTokens.userId, user.id),
          notInArray(
            nativePushTokens.id,
            keep.map((row) => row.id),
          ),
        ),
      );
  }

  return json({ ok: true }, { status: 201 });
});

export const DELETE = api(async (req) => {
  const user = await requireUser();
  const { token } = await readJson(req, nativePushDeleteSchema);
  // Only your own token: holding a token string must never let one user
  // silence another's notifications.
  await db
    .delete(nativePushTokens)
    .where(
      and(
        eq(nativePushTokens.token, token),
        eq(nativePushTokens.userId, user.id),
      ),
    );
  return json({ ok: true });
});
