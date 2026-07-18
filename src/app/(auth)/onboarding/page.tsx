import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { listWorkspacesForUser } from "@/server/dal/workspaces";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; plan?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const plan =
    params.plan === "team" || params.plan === "studio" ? params.plan : null;

  // Returning users with a workspace go straight in (unless adding another).
  // A pending plan choice takes them to that workspace's checkout instead.
  if (!params.new) {
    const existing = await listWorkspacesForUser(db, user.id);
    if (existing.length > 0) {
      redirect(
        plan
          ? `/w/${existing[0].slug}/settings/billing?plan=${plan}`
          : `/w/${existing[0].slug}`,
      );
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Name your workspace
      </h1>
      <p className="mt-1.5 text-muted">
        Usually your company or team name. You can invite the team right
        after, this takes under a minute.
      </p>
      <OnboardingForm plan={plan} />
    </div>
  );
}
