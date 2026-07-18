import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { listWorkspacesForUser } from "@/server/dal/workspaces";

/**
 * Post-sign-in router: first workspace, or onboarding when there is none.
 * A `plan` hint (set when someone picked a paid band on the pricing page)
 * is carried through to billing so "Start with Team" actually lands them on
 * Team checkout, even for brand-new users who create a workspace first.
 */
export default async function AppEntry({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await requireUser();
  const { plan } = await searchParams;
  const planQ =
    plan === "team" || plan === "studio" ? `?plan=${plan}` : "";

  const workspaces = await listWorkspacesForUser(db, user.id);
  if (workspaces.length === 0) redirect(`/onboarding${planQ}`);
  redirect(
    planQ
      ? `/w/${workspaces[0].slug}/settings/billing${planQ}`
      : `/w/${workspaces[0].slug}`,
  );
}
