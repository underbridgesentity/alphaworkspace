import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteWorkspace } from "@/server/dal/workspaces";

/**
 * Deletion purges Supabase storage before it drops the rows, and a long-lived
 * workspace can hold thousands of attachments.
 *
 * 60 rather than 300 deliberately: 60s is the ceiling on every Vercel plan,
 * where 300 is a Pro allowance that is REJECTED AT DEPLOY on Hobby. A value
 * that fails the deploy is worse than a shorter budget, because deleteObjects
 * carries its own 45s deadline and hands control back in time for the row
 * delete to run. Objects it did not reach are logged and left in the bucket:
 * the deletion always completes, which is the obligation this route exists for.
 */
export const maxDuration = 60;

/** POPIA: owner-only workspace deletion that actually deletes (cascade). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteWorkspace(ctx);
  return json({ ok: true });
});
