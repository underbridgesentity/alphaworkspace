import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { removePassword, setPassword } from "@/server/auth-password";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError, ValidationError } from "@/server/dal/errors";

const setSchema = z.object({
  current: z.string().max(200).optional(),
  next: z.string().min(1).max(200),
});

/** Set or change the signed-in user's password. */
export const POST = api(async (req) => {
  const user = await requireUser();
  if (!checkRateLimit(`pw-set:${user.id}`, 6, 10 * 60_000)) {
    throw new RateLimitError();
  }
  const input = await readJson(req, setSchema);
  const result = await setPassword(db, user.id, input);
  if (!result.ok) throw new ValidationError(result.message);
  return json({ ok: true });
});

const removeSchema = z.object({ current: z.string().min(1).max(200) });

/** Drop the password, back to magic link / Google only. */
export const DELETE = api(async (req) => {
  const user = await requireUser();
  if (!checkRateLimit(`pw-set:${user.id}`, 6, 10 * 60_000)) {
    throw new RateLimitError();
  }
  const { current } = await readJson(req, removeSchema);
  const result = await removePassword(db, user.id, current);
  if (!result.ok) throw new ValidationError(result.message);
  return json({ ok: true });
});
