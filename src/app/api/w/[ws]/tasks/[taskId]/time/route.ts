import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { taskTime } from "@/server/dal/time";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ time: await taskTime(ctx, params.taskId) });
});
