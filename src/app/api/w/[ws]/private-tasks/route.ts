import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { privateTaskCreateSchema } from "@/lib/validators";
import {
  createPrivateTask,
  listPrivateTasks,
} from "@/server/dal/private-tasks";

/** The caller's own private list; nobody else's items ever leave the DAL. */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ tasks: await listPrivateTasks(ctx) });
});

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, privateTaskCreateSchema);
  return json({ task: await createPrivateTask(ctx, input) });
});
