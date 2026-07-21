import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { privateTaskPatchSchema } from "@/lib/validators";
import {
  deletePrivateTask,
  updatePrivateTask,
} from "@/server/dal/private-tasks";

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, privateTaskPatchSchema);
  return json({ task: await updatePrivateTask(ctx, params.privateTaskId, input) });
});

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deletePrivateTask(ctx, params.privateTaskId);
  return json({ ok: true });
});
