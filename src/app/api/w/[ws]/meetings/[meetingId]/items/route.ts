import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { meetingItemSchema } from "@/lib/validators";
import { resolveActionItem } from "@/server/dal/meetings";

/** Accept (creates the task) or dismiss one proposed action item. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, meetingItemSchema);
  return json(await resolveActionItem(ctx, params.meetingId, input));
});
