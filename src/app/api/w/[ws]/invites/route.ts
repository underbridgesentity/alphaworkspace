import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createInvite, listInvites } from "@/server/dal/workspaces";
import { inviteCreateSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ invites: await listInvites(ctx) });
});

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, inviteCreateSchema);
  const invite = await createInvite(ctx, input);
  return json({ invite: { id: invite.id } }, { status: 201 });
});
