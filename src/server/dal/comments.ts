/**
 * Comments. Adding one touches the task's lastActivityAt (it isn't stale if
 * people are talking about it) and quietly tells the people involved.
 */
import { and, eq } from "drizzle-orm";
import { comments, memberships, tasks, users } from "@/server/db/schema";
import type { CommentDTO } from "@/lib/types";
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
