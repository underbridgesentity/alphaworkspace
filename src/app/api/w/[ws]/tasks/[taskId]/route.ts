import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteTask, taskDetail, updateTask } from "@/server/dal/tasks";
import { taskUpdateSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json(await taskDetail(ctx, params.taskId));
});

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, taskUpdateSchema);
  const task = await updateTask(ctx, params.taskId, input);
  return json({ task });
});

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteTask(ctx, params.taskId);
  return json({ ok: true });
});
