import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createTask } from "@/server/dal/tasks";
import { taskCreateSchema } from "@/lib/validators";

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, taskCreateSchema);
  const task = await createTask(ctx, input);
  return json({ task }, { status: 201 });
});
