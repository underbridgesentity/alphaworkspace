import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { meetingBeginSchema } from "@/lib/validators";
import {
  beginMeeting,
  listMeetings,
  meetingUsage,
} from "@/server/dal/meetings";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { RateLimitError } from "@/server/dal/errors";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  const [meetings, usage] = await Promise.all([
    listMeetings(ctx),
    meetingUsage(ctx),
  ]);
  return json({ meetings, usage });
});

/** Reserve an upload slot for a finished recording; returns a signed PUT url. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  if (!checkRateLimit(`meeting-begin:${ctx.userId}`, 10, 60_000)) {
    throw new RateLimitError();
  }
  const input = await readJson(req, meetingBeginSchema);
  return json(await beginMeeting(ctx, input));
});
