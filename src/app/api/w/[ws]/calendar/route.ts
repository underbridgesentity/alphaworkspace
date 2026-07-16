import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { tasksByDueDate } from "@/server/dal/tasks";
import { dayString } from "@/lib/validators";
import { ValidationError } from "@/server/dal/errors";

export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const url = new URL(req.url);
  const from = dayString.safeParse(url.searchParams.get("from"));
  const to = dayString.safeParse(url.searchParams.get("to"));
  if (!from.success || !to.success) {
    throw new ValidationError("from/to must be YYYY-MM-DD");
  }
  return json({ tasks: await tasksByDueDate(ctx, from.data, to.data) });
});
