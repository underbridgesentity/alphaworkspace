import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteWorkspace } from "@/server/dal/workspaces";

/** POPIA: owner-only workspace deletion that actually deletes (cascade). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteWorkspace(ctx);
  return json({ ok: true });
});
