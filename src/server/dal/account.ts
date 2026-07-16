/**
 * POPIA account rights: per-user data export (JSON) and deletion that
 * actually deletes. Deleting the last owner of a multi-member workspace is
 * blocked until ownership moves — nobody's team vanishes by accident.
 */
import { and, count, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  comments,
  memberships,
  notifications,
  tasks,
  users,
  voiceCaptures,
  workspaces,
} from "@/server/db/schema";
import { ValidationError } from "./errors";

export async function exportUserData(db: Db, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      notificationPrefs: users.notificationPrefs,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  const [memberOf, assigned, created, authored, captures, notifs] =
    await Promise.all([
      db
        .select({
          workspace: workspaces.name,
          slug: workspaces.slug,
          role: memberships.role,
          joinedAt: memberships.joinedAt,
        })
        .from(memberships)
        .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
        .where(eq(memberships.userId, userId)),
      db.select().from(tasks).where(eq(tasks.assigneeId, userId)),
      db.select().from(tasks).where(eq(tasks.createdBy, userId)),
      db.select().from(comments).where(eq(comments.authorId, userId)),
      db
        .select({
          transcript: voiceCaptures.transcript,
          source: voiceCaptures.source,
          status: voiceCaptures.status,
          createdAt: voiceCaptures.createdAt,
        })
        .from(voiceCaptures)
        .where(eq(voiceCaptures.userId, userId)),
      db.select().from(notifications).where(eq(notifications.userId, userId)),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    memberships: memberOf,
    tasksAssignedToMe: assigned,
    tasksCreatedByMe: created,
    comments: authored,
    voiceCaptures: captures,
    notifications: notifs,
  };
}

export async function deleteAccount(db: Db, userId: string): Promise<void> {
  const owned = await db
    .select({ workspaceId: memberships.workspaceId, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")));

  for (const ws of owned) {
    const [others] = await db
      .select({ n: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, ws.workspaceId),
          ne(memberships.userId, userId),
        ),
      );
    if ((others?.n ?? 0) > 0) {
      throw new ValidationError(
        `You own “${ws.name}” which still has members. Hand over ownership or remove them first.`,
      );
    }
    // Sole member — the workspace goes with the account (cascade).
    await db.delete(workspaces).where(eq(workspaces.id, ws.workspaceId));
  }

  await db.delete(users).where(eq(users.id, userId));
}
