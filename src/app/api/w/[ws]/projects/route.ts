import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { createProject, listProjects } from "@/server/dal/projects";
import { projectCreateSchema } from "@/lib/validators";

export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const includeArchived =
    new URL(req.url).searchParams.get("archived") === "1";
  return json({ projects: await listProjects(ctx, { includeArchived }) });
});

export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const input = await readJson(req, projectCreateSchema);
  const project = await createProject(ctx, input);
  return json({ project }, { status: 201 });
});
