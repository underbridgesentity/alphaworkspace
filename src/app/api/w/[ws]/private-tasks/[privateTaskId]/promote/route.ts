import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { privateTaskPromoteSchema } from "@/lib/validators";
import { promotePrivateTask } from "@/server/dal/private-tasks";

/** Owner-only: turn a private item into an ordinary, team-visible task. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, privateTaskPromoteSchema);
  return json({ task: await promotePrivateTask(ctx, params.privateTaskId, input) });
});
