"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { acceptInvite } from "@/server/dal/workspaces";
import { AppError } from "@/server/dal/errors";

export interface AcceptState {
  error?: string;
}

export async function acceptInviteAction(
  token: string,
  _prev: AcceptState,
  _formData: FormData,
): Promise<AcceptState> {
  void _prev;
  void _formData;
  const user = await requireUser();
  let slug: string;
  try {
    const result = await acceptInvite(db, user, token);
    slug = result.workspaceSlug;
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    throw err;
  }
  redirect(`/w/${slug}`);
}
