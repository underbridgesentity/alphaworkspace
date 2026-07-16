import { api, json } from "@/server/api-utils";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { listWorkspacesForUser } from "@/server/dal/workspaces";

export const GET = api(async () => {
  const user = await requireUser();
  return json({ workspaces: await listWorkspacesForUser(db, user.id) });
});
