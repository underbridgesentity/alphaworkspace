import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createLabel, listLabels } from "@/server/dal/labels";
import { labelCreateSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ labels: await listLabels(ctx) });
});

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, labelCreateSchema);
  const label = await createLabel(ctx, input);
  return json({ label }, { status: 201 });
});
