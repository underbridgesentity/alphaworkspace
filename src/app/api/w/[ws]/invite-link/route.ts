import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createInviteLink } from "@/server/dal/workspaces";
import { invitableRoleSchema } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({ role: invitableRoleSchema.default("member") });

/** Mint a fresh shareable invite link (admin only). */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { role } = await readJson(req, schema);
  const link = await createInviteLink(ctx, role);
  return json(link, { status: 201 });
});
