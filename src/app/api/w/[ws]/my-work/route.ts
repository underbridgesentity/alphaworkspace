import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { myWork } from "@/server/dal/tasks";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ tasks: await myWork(ctx) });
});
