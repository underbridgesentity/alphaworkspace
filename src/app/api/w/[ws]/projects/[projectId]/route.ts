import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { getProject, updateProject } from "@/server/dal/projects";
import { projectUpdateSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  return json({ project: await getProject(ctx, params.projectId) });
});

export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, projectUpdateSchema);
  const project = await updateProject(ctx, params.projectId, input);
  return json({ project });
});
