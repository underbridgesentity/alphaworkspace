import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { transferOwnership } from "@/server/dal/workspaces";

/** Owner-only: hand the workspace to another member (they become owner). */
export const POST = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await transferOwnership(ctx, params.membershipId);
  return json({ ok: true });
});
