import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteWorkspace } from "@/server/dal/workspaces";

/**
 * Deletion purges Supabase storage before it drops the rows, and a long-lived
 * workspace can hold thousands of attachments. On the default budget the
 * function can die mid-purge, after the objects are gone but before the
 * workspace row is, leaving an undeletable workspace pointing at files that no
 * longer exist. The purge batches 100 paths per request, so this ceiling is
 * generous headroom rather than an expected duration.
 */
export const maxDuration = 300;

/** POPIA: owner-only workspace deletion that actually deletes (cascade). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteWorkspace(ctx);
  return json({ ok: true });
});
