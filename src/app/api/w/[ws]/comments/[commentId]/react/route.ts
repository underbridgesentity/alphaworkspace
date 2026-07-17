import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { toggleReaction } from "@/server/dal/comments";
import { reactionToggleSchema } from "@/lib/validators";

/** Toggle the caller's emoji reaction on a comment. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { emoji } = await readJson(req, reactionToggleSchema);
  const result = await toggleReaction(ctx, params.commentId, emoji);
  return json(result);
});
