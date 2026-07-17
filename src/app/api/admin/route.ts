import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import {
  listWorkspacesAdmin,
  platformOverview,
  recentSignups,
  requireOperator,
  setWorkspacePlanAdmin,
} from "@/server/admin/operator";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireUser();
  await requireOperator(user);
  const [overview, workspaces, signups30d] = await Promise.all([
    platformOverview(),
    listWorkspacesAdmin(),
    recentSignups(30),
  ]);
  return json({ overview: { ...overview, signups30d }, workspaces });
});

const planSchema = z.object({
  workspaceId: z.uuid(),
  plan: z.enum(["free", "team", "studio"]),
});

/** Operator comp/downgrade, changes a plan without PayFast. */
export const POST = api(async (req) => {
  const user = await requireUser();
  await requireOperator(user);
  const { workspaceId, plan } = await readJson(req, planSchema);
  await setWorkspacePlanAdmin(workspaceId, plan, user.id);
  return json({ ok: true });
});
