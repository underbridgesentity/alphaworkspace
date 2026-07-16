import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { changeMemberRole, removeMember } from "@/server/dal/workspaces";
import { memberRoleSchema } from "@/lib/validators";

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { role } = await readJson(req, memberRoleSchema);
  await changeMemberRole(ctx, params.membershipId, role);
  return json({ ok: true });
});

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await removeMember(ctx, params.membershipId);
  return json({ ok: true });
});
