import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { meetingBotSchema } from "@/lib/validators";
import { sendBot } from "@/server/dal/meetings";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError } from "@/server/dal/errors";

/** Send the notetaker bot into a Zoom/Meet/Teams call (add-on gated). */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  if (!checkRateLimit(`meeting-bot:${ctx.userId}`, 5, 60_000)) {
    throw new RateLimitError();
  }
  const input = await readJson(req, meetingBotSchema);
  return json({ meeting: await sendBot(ctx, input) });
});
