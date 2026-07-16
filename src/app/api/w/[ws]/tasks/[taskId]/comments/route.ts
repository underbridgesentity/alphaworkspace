import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { addComment } from "@/server/dal/comments";
import { commentCreateSchema } from "@/lib/validators";

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, commentCreateSchema);
  const comment = await addComment(ctx, params.taskId, input);
  return json({ comment }, { status: 201 });
});
