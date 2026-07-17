import "server-only";

/**
 * Small security primitives shared by routes.
 */
import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (secrets, tokens). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Bearer-token check for cron/automation endpoints, timing-safe. */
export function bearerMatches(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false; // unset secret means CLOSED, never open
  return safeEqual(authorization ?? "", `Bearer ${secret}`);
}
