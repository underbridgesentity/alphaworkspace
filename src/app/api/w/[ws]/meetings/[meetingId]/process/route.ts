import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { processMeeting } from "@/server/dal/meetings";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError } from "@/server/dal/errors";

/** Transcribing a two-hour meeting takes a while; give the function room. */
export const maxDuration = 300;

export const POST = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  if (!checkRateLimit(`meeting-process:${ctx.userId}`, 6, 60_000)) {
    throw new RateLimitError();
  }
  return json({ meeting: await processMeeting(ctx, params.meetingId) });
});
