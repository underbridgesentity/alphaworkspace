/**
 * Per-user sliding-window rate limiter for AI routes. In-memory and
 * per-instance — best-effort abuse damping on serverless, not the real
 * guard (entitlement caps and max_tokens limits are). Good enough to stop
 * a stuck client hammering the model.
 */

const windows = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const stamps = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limit) {
    windows.set(key, stamps);
    return false;
  }
  stamps.push(now);
  windows.set(key, stamps);
  return true;
}

export function resetRateLimits(): void {
  windows.clear();
}
