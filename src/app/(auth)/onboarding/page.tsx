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
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Returning users with a workspace go straight in (unless adding another).
  if (!params.new) {
    const existing = await listWorkspacesForUser(db, user.id);
    if (existing.length > 0) redirect(`/w/${existing[0].slug}`);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Name your workspace
      </h1>
      <p className="mt-1.5 text-muted">
        Usually your studio or agency name. You can invite the team right
        after — this takes under a minute.
      </p>
      <OnboardingForm />
    </div>
  );
}
