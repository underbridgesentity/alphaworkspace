"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { createWorkspace } from "@/server/dal/workspaces";
import { workspaceCreateSchema } from "@/lib/validators";
import { checkRateLimit } from "@/server/ai/ratelimit";

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

  // Nobody legitimately creates workspaces in bulk; blunt the abuse edge.
  if (!checkRateLimit(`ws-create:${user.id}`, 5, 60 * 60_000)) {
    return { error: "That's a lot of new workspaces at once. Give it an hour." };
  }

  const ws = await createWorkspace(db, user.id, parsed.data);
  redirect(`/w/${ws.slug}?welcome=1`);
}
