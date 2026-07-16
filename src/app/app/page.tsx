import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { listWorkspacesForUser } from "@/server/dal/workspaces";

/** Post-sign-in router: first workspace, or onboarding when there is none. */
export default async function AppEntry() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(db, user.id);
  if (workspaces.length === 0) redirect("/onboarding");
  redirect(`/w/${workspaces[0].slug}`);
}
