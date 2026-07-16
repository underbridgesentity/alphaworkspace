/**
 * The write queue that makes Alpha work on the taxi ride: mutations made
 * offline are stored here in order and replayed when connectivity returns
 * (last write wins server-side). Creates carry client-generated UUIDs so
 * replays are idempotent.
 */
import { idb } from "./idb";

export interface OutboxOp {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: unknown;
  createdAt: number;
}

export async function enqueue(op: Omit<OutboxOp, "id" | "createdAt">): Promise<void> {
  await idb.put<OutboxOp>({
    ...op,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  });
  // Ask the SW to replay us if the tab dies before we're back online.
  try {
    const reg = (await navigator.serviceWorker?.ready) as
      | (ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        })
      | undefined;
    await reg?.sync?.register("aw-outbox");
  } catch {
    // Background Sync unsupported — the online/focus listeners cover it.
  }
}

export async function pendingCount(): Promise<number> {
  try {
    return await idb.count();
  } catch {
    return 0;
  }
}

let flushing = false;

export interface FlushResult {
  sent: number;
  dropped: number;
  remaining: number;
}

/**
 * Replays queued ops in order. Stops on network failure or 401 (resumes on
 * the next trigger); drops ops the server permanently rejects (4xx) — a
 * replayed DELETE hitting 404 counts as success.
 */
export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return { sent: 0, dropped: 0, remaining: await pendingCount() };
  flushing = true;
  let sent = 0;
  let dropped = 0;
  try {
    const ops = (await idb.getAll<OutboxOp>()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const op of ops) {
      let res: Response;
      try {
        res = await fetch(op.url, {
          method: op.method,
          headers: { "content-type": "application/json" },
          body: op.body === undefined ? undefined : JSON.stringify(op.body),
        });
      } catch {
        break; // still offline — try again later
      }
      if (res.ok || (op.method === "DELETE" && res.status === 404)) {
        await idb.delete(op.id);
        sent++;
        continue;
      }
      if (res.status === 401) break; // needs sign-in; keep the queue intact
      // Permanent rejection — dropping beats blocking the whole queue.
      await idb.delete(op.id);
      dropped++;
      console.warn("[outbox] dropped", op.method, op.url, res.status);
    }
  } finally {
    flushing = false;
  }
  return { sent, dropped, remaining: await pendingCount() };
}
