import { z } from "zod";
import { api, json, readJson } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import {
  listWorkspacesAdmin,
  platformOverview,
  recentSignups,
  requireOperator,
  setMeetingBotsAdmin,
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

const adminActionSchema = z.union([
  z.object({
    workspaceId: z.uuid(),
    plan: z.enum(["free", "team", "studio"]),
  }),
  z.object({
    workspaceId: z.uuid(),
    meetingBots: z.boolean(),
  }),
]);

/** Operator controls: comp/downgrade a plan, or toggle the bots add-on. */
export const POST = api(async (req) => {
  const user = await requireUser();
  await requireOperator(user);
  const input = await readJson(req, adminActionSchema);
  if ("plan" in input) {
    await setWorkspacePlanAdmin(input.workspaceId, input.plan, user.id);
  } else {
    await setMeetingBotsAdmin(input.workspaceId, input.meetingBots, user.id);
  }
  return json({ ok: true });
});
