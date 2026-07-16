import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { listMembers } from "@/server/dal/workspaces";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ members: await listMembers(ctx) });
});
