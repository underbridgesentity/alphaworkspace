import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { revokeInvite } from "@/server/dal/workspaces";

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await revokeInvite(ctx, params.inviteId);
  return json({ ok: true });
});
