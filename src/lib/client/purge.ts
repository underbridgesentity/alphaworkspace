/**
 * Local-data hygiene for sign-out on shared devices: drop the offline data
 * and page caches (personal workspace reads) and the outbox (queued writes
 * must never replay under the NEXT person's session). Static asset caches
 * stay, they hold nothing personal. Best-effort by design: a failed purge
 * must never block signing out.
 */
import { idb } from "./idb";

export async function purgeLocalData(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("data-") || k.startsWith("pages-"))
        .map((k) => caches.delete(k)),
    );
  } catch {
    // no Cache API (old browser) or blocked; nothing to purge
  }
  try {
    await idb.clear();
  } catch {
    // outbox store missing; fine
  }
}
