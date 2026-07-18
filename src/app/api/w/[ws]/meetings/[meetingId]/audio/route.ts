import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { deleteMeetingAudio, meetingAudioUrl } from "@/server/dal/meetings";

/** Short-lived signed playback URL (same visibility wall as the meeting). */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ url: await meetingAudioUrl(ctx, params.meetingId) });
});

/** Drop the audio, keep transcript + summary (the POPIA-friendly cleanup). */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteMeetingAudio(ctx, params.meetingId);
  return json({ ok: true });
});
