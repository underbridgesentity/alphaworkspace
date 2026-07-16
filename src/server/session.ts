import "server-only";
import { cache } from "react";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { resolveCtx, type Ctx } from "@/server/dal/context";
import { AuthError } from "@/server/dal/errors";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

/** The signed-in user, or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  return { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new AuthError();
  return user;
}

/**
 * The one door into tenant data from routes and server components:
 * session → membership → workspace-scoped Ctx.
 */
export async function withWorkspace(slugOrId: string): Promise<Ctx> {
  const user = await requireUser();
  return resolveCtx(db, user.id, slugOrId);
}
