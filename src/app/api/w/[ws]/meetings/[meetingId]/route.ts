import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { meetingPatchSchema } from "@/lib/validators";
import {
  deleteMeeting,
  getMeeting,
  updateMeeting,
} from "@/server/dal/meetings";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ meeting: await getMeeting(ctx, params.meetingId) });
});

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, meetingPatchSchema);
  return json({ meeting: await updateMeeting(ctx, params.meetingId, input) });
});

export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await deleteMeeting(ctx, params.meetingId);
  return json({ ok: true });
});
