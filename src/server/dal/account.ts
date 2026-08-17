/**
 * POPIA account rights: per-user data export (JSON) and deletion that
 * actually deletes. Deleting the last owner of a multi-member workspace is
 * blocked until ownership moves, nobody's team vanishes by accident.
 */
import { and, count, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  attachments,
  comments,
  invites,
  meetings,
  memberships,
  notifications,
  privateTasks,
  tasks,
  users,
  voiceCaptures,
  workspaces,
} from "@/server/db/schema";
import { deleteObjects } from "@/server/storage";
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

  const [memberOf, assigned, created, authored, captures, notifs, privates] =
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
      db.select().from(privateTasks).where(eq(privateTasks.userId, userId)),
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
    privateTasks: privates,
  };
}

export async function deleteAccount(db: Db, userId: string): Promise<void> {
  const owned = await db
    .select({ workspaceId: memberships.workspaceId, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")));

  const soleOwned: string[] = [];
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
    soleOwned.push(ws.workspaceId);
  }

  /*
   * Collect the stored objects BEFORE anything is deleted, because the rows
   * holding their paths are what the cascade is about to remove. Without this
   * the files stayed in the bucket forever with nothing left that could ever
   * name them again: unreachable, unbilled to anyone, and still personal data.
   *
   * Two separate sources, and the second is easy to miss:
   *   - everything inside a workspace that dies with this account, and
   *   - every meeting this user recorded ANYWHERE, because meetings.created_by
   *     cascades, so their recordings vanish even from workspaces that live on.
   * Attachments need no such pass: uploader_id is SET NULL, so an attachment
   * in a surviving workspace stays with its task and keeps its file.
   */
  const [wsAttachments, wsMeetings, ownMeetings] = await Promise.all([
    soleOwned.length
      ? db
          .select({ path: attachments.storagePath })
          .from(attachments)
          .where(inArray(attachments.workspaceId, soleOwned))
      : Promise.resolve([]),
    soleOwned.length
      ? db
          .select({ path: meetings.audioPath })
          .from(meetings)
          .where(
            and(
              inArray(meetings.workspaceId, soleOwned),
              isNotNull(meetings.audioPath),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ path: meetings.audioPath })
      .from(meetings)
      .where(and(eq(meetings.createdBy, userId), isNotNull(meetings.audioPath))),
  ]);

  const paths = [...wsAttachments, ...wsMeetings, ...ownMeetings]
    .map((r) => r.path)
    .filter((p): p is string => !!p);

  // Best effort, and deliberately before the rows: a storage failure must not
  // block a deletion request, and doing it first leaves the paths on record if
  // this crashes midway.
  await deleteObjects(paths);

  /*
   * Revoke the invites this person issued but nobody has accepted yet.
   *
   * invites.invited_by is SET NULL now, so an unaccepted link outlives its
   * author. A shareable link can carry the admin role and lasts 90 days, so
   * without this an admin could mint one, delete their account, sign up again
   * on the same address and walk back in as admin. Deletion was impossible
   * before this change, which is the only reason that was not already reachable.
   *
   * Accepted invites are left alone: they are the audit record of how a
   * current member got in, and the token is already spent.
   */
  await db
    .delete(invites)
    .where(and(eq(invites.invitedBy, userId), isNull(invites.acceptedAt)));

  for (const workspaceId of soleOwned) {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  }

  await db.delete(users).where(eq(users.id, userId));
}
