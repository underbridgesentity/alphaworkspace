/**
 * Comments. Adding one touches the task's lastActivityAt (it isn't stale if
 * people are talking about it) and quietly tells the people involved.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  commentReactions,
  comments,
  memberships,
  tasks,
  users,
} from "@/server/db/schema";
import type { CommentDTO, CommentReactionDTO } from "@/lib/types";
import { notify } from "@/server/notifications/service";
import { matchMentions } from "@/lib/mentions";
import type { Ctx } from "./context";
import { logActivity } from "./activity";
import { NotFoundError } from "./errors";

export async function addComment(
  ctx: Ctx,
  taskId: string,
  input: { id?: string; body: string },
): Promise<CommentDTO> {
  const [task] = await ctx.db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      assigneeId: tasks.assigneeId,
      createdBy: tasks.createdBy,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
  if (!task) throw new NotFoundError("Task not found");

  const [row] = await ctx.db
    .insert(comments)
    .values({
      ...(input.id ? { id: input.id } : {}),
      workspaceId: ctx.workspace.id,
      taskId,
      authorId: ctx.userId,
      body: input.body,
    })
    .onConflictDoNothing({ target: comments.id })
    .returning();

  if (!row) {
    // Offline replay of an already-synced comment.
    const [existing] = await ctx.db
      .select({ comment: comments, author: users })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.id, input.id!));
    return {
      id: existing.comment.id,
      taskId,
      body: existing.comment.body,
      createdAt: existing.comment.createdAt.toISOString(),
      author: {
        id: existing.author.id,
        name: existing.author.name,
        email: existing.author.email,
        image: existing.author.image,
      },
    };
  }

  await ctx.db
    .update(tasks)
    .set({ lastActivityAt: new Date() })
    .where(eq(tasks.id, taskId));

  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "comment_added",
    actorId: ctx.userId,
    projectId: task.projectId,
    taskId,
    data: { preview: input.body.slice(0, 120) },
  });

  // @mentions get their own (louder) ping; others involved get the quiet one.
  const memberRows = await ctx.db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.workspaceId, ctx.workspace.id));
  const mentioned = matchMentions(input.body, memberRows);
  const mentionedIds = new Set(mentioned.map((m) => m.id));
  const url = `/w/${ctx.workspace.slug}/p/${task.projectId}?task=${taskId}`;

  if (mentioned.length > 0) {
    await notify(ctx.db, {
      workspaceId: ctx.workspace.id,
      userIds: [...mentionedIds],
      actorId: ctx.userId,
      type: "mentioned",
      payload: {
        title: `You were mentioned on “${task.title}”`,
        body: input.body.slice(0, 200),
        url,
        taskId,
      },
    });
  }

  await notify(ctx.db, {
    workspaceId: ctx.workspace.id,
    userIds: [task.assigneeId, task.createdBy].filter(
      (id): id is string => !!id && !mentionedIds.has(id),
    ),
    actorId: ctx.userId,
    type: "comment_added",
    payload: {
      title: `Comment on “${task.title}”`,
      body: input.body.slice(0, 200),
      url,
      taskId,
    },
  });

  const [author] = await ctx.db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, ctx.userId));

  return {
    id: row.id,
    taskId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author,
  };
}

/* ------------------------------ reactions -------------------------------- */

/**
 * Toggle the caller's reaction. Add wins on the unique index; a second call
 * with the same emoji removes it. No notification, no activity event, a
 * reaction is meant to END a thread, not extend one.
 */
export async function toggleReaction(
  ctx: Ctx,
  commentId: string,
  emoji: string,
): Promise<{ added: boolean }> {
  const [comment] = await ctx.db
    .select({ id: comments.id })
    .from(comments)
    .where(
      and(eq(comments.id, commentId), eq(comments.workspaceId, ctx.workspace.id)),
    );
  if (!comment) throw new NotFoundError("Comment not found");

  const inserted = await ctx.db
    .insert(commentReactions)
    .values({
      workspaceId: ctx.workspace.id,
      commentId,
      userId: ctx.userId,
      emoji,
    })
    .onConflictDoNothing({
      target: [
        commentReactions.commentId,
        commentReactions.userId,
        commentReactions.emoji,
      ],
    })
    .returning({ id: commentReactions.id });
  if (inserted.length > 0) return { added: true };

  await ctx.db
    .delete(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.userId, ctx.userId),
        eq(commentReactions.emoji, emoji),
      ),
    );
  return { added: false };
}

/**
 * Aggregate reactions for a set of (already workspace-scoped) comment ids,
 * grouped per emoji in first-reacted order, with the viewer's own marked.
 */
export async function reactionsForComments(
  db: Db,
  viewerId: string,
  commentIds: string[],
): Promise<Map<string, CommentReactionDTO[]>> {
  const map = new Map<string, CommentReactionDTO[]>();
  if (commentIds.length === 0) return map;

  const rows = await db
    .select({
      commentId: commentReactions.commentId,
      emoji: commentReactions.emoji,
      userId: commentReactions.userId,
    })
    .from(commentReactions)
    .where(inArray(commentReactions.commentId, commentIds))
    .orderBy(asc(commentReactions.createdAt));

  for (const r of rows) {
    const list = map.get(r.commentId) ?? [];
    let entry = list.find((e) => e.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, mine: false };
      list.push(entry);
    }
    entry.count += 1;
    if (r.userId === viewerId) entry.mine = true;
    map.set(r.commentId, list);
  }
  return map;
}
