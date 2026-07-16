import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { discardCapture } from "@/server/dal/captures";

export const POST = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  await discardCapture(ctx, params.captureId);
  return json({ ok: true });
});
