"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { createWorkspace } from "@/server/dal/workspaces";
import { workspaceCreateSchema } from "@/lib/validators";

export interface OnboardingState {
  error?: string;
}

export async function createWorkspaceAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();

  const parsed = workspaceCreateSchema.safeParse({
    name: formData.get("name"),
    seedStarter: formData.get("seedStarter") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name" };
  }

  const ws = await createWorkspace(db, user.id, parsed.data);
  redirect(`/w/${ws.slug}?welcome=1`);
}
