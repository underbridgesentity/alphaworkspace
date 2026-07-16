import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { updateWorkspace } from "@/server/dal/workspaces";
import { workspaceSettingsSchema } from "@/lib/validators";

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, workspaceSettingsSchema);
  const { name, ...settings } = input;
  await updateWorkspace(ctx, {
    name,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  });
  return json({ ok: true });
});
