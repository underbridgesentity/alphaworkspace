import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { captureConfirmSchema } from "@/lib/validators";
import { confirmCapture } from "@/server/dal/captures";

/** The only path from AI proposals to real tasks, human confirmation. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { tasks } = await readJson(req, captureConfirmSchema);
  const created = await confirmCapture(ctx, params.captureId, tasks);
  return json({ tasks: created }, { status: 201 });
});
