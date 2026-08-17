import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteWorkspace } from "@/server/dal/workspaces";

/**
 * Deletion purges Supabase storage before it drops the rows, and a long-lived
 * workspace can hold thousands of attachments.
 *
 * 60 rather than 300 because deleteObjects carries its own 45s deadline and
 * hands control back in time for the row delete to run, so a higher ceiling
 * would buy nothing. Objects it did not reach are logged and left in the
 * bucket: the deletion always completes, which is the obligation this route
 * exists for.
 *
 * This is NOT a plan limit. Four routes in this repo already ship
 * maxDuration = 300 (the Recall webhook, both crons, meeting processing) and
 * deploy fine, and they need it. Do not "correct" them down to match this one.
 */
export const maxDuration = 60;

/** POPIA: owner-only workspace deletion that actually deletes (cascade). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteWorkspace(ctx);
  return json({ ok: true });
});
