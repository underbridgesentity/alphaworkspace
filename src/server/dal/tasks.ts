/**
 * Task data access. Every read filters by ctx.workspace.id; every mutation
 * verifies ownership before touching rows, logs activity, and (where a human
 * should know) notifies through the NotificationService.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  comments,
  labels,
  projects,
  taskLabels,
  tasks,
  users,
} from "@/server/db/schema";
import type { TaskCreateInput, TaskUpdateInput } from "@/lib/validators";
import type { ActivityDTO, CommentDTO, TaskDTO, UserLite } from "@/lib/types";
import { todaySAST } from "@/lib/dates";
import { notify } from "@/server/notifications/service";
import { activityEvents } from "@/server/db/schema";
import type { Ctx } from "./context";
import { logActivity, type ActivityInput } from "./activity";
import { NotFoundError, ValidationError } from "./errors";

type TaskRow = typeof tasks.$inferSelect;

const userLite = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
};

/* ------------------------------ assembly -------------------------------- */

async function labelsForTasks(
  db: Db,
  taskIds: string[],
): Promise<Map<string, { id: string; name: string; color: string }[]>> {
  const map = new Map<string, { id: string; name: string; color: string }[]>();
  if (taskIds.length === 0) return map;
  const rows = await db
    .select({
      taskId: taskLabels.taskId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(taskLabels)
    .innerJoin(labels, eq(taskLabels.labelId, labels.id))
    .where(inArray(taskLabels.taskId, taskIds));
  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.taskId, list);
  }
  return map;
}

function toDTO(
  row: TaskRow,
  assignee: UserLite | null,
  taskLabelList: { id: string; name: string; color: string }[],
  project?: { name: string; color: string },
): TaskDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assigneeId,
    assignee,
    dueDate: row.dueDate,
    priority: row.priority,
    position: row.position,
    labels: taskLabelList,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    ...(project ? { projectName: project.name, projectColor: project.color } : {}),
  };
}

async function assembleMany(
  db: Db,
  rows: {
    task: TaskRow;
    assignee: UserLite | null;
    project?: { name: string; color: string };
  }[],
): Promise<TaskDTO[]> {
  const labelMap = await labelsForTasks(
    db,
    rows.map((r) => r.task.id),
  );
  return rows.map((r) =>
    toDTO(r.task, r.assignee, labelMap.get(r.task.id) ?? [], r.project),
  );
}

/* ------------------------------ guards ---------------------------------- */

async function requireProject(ctx: Ctx, projectId: string) {
  const rows = await ctx.db
    .select({ id: projects.id, name: projects.name, color: projects.color })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Project not found");
  return rows[0];
}

async function requireTask(ctx: Ctx, taskId: string): Promise<TaskRow> {
  const rows = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Task not found");
  return rows[0];
}

async function assertMembersInWorkspace(ctx: Ctx, userIds: string[]) {
  if (userIds.length === 0) return;
  const { memberships } = await import("@/server/db/schema");
  const rows = await ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, ctx.workspace.id),
        inArray(memberships.userId, userIds),
      ),
    );
  if (rows.length !== new Set(userIds).size) {
    throw new ValidationError("Assignee is not a member of this workspace");
  }
}

async function assertLabelsInWorkspace(ctx: Ctx, labelIds: string[]) {
  if (labelIds.length === 0) return;
  const rows = await ctx.db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(eq(labels.workspaceId, ctx.workspace.id), inArray(labels.id, labelIds)),
    );
  if (rows.length !== new Set(labelIds).size) {
    throw new ValidationError("Unknown label");
  }
}

/* ------------------------------- reads ---------------------------------- */

export async function boardTasks(ctx: Ctx, projectId: string): Promise<TaskDTO[]> {
  await requireProject(ctx, projectId);
  const rows = await ctx.db
    .select({ task: tasks, assignee: userLite })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(eq(tasks.workspaceId, ctx.workspace.id), eq(tasks.projectId, projectId)),
    )
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return assembleMany(ctx.db, rows);
}

const priorityRank = sql<number>`case ${tasks.priority}
  when 'high' then 3 when 'med' then 2 when 'low' then 1 else 0 end`;

/** Everything assigned to me, overdue first, then by due date. */
export async function myWork(ctx: Ctx): Promise<TaskDTO[]> {
  const today = todaySAST();
  const rows = await ctx.db
    .select({
      task: tasks,
      assignee: userLite,
      project: { name: projects.name, color: projects.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspace.id),
        eq(tasks.assigneeId, ctx.userId),
        ne(tasks.status, "done"),
        eq(projects.status, "active"),
      ),
    )
    .orderBy(
      desc(sql`(${tasks.dueDate} < ${today})`),
      sql`${tasks.dueDate} asc nulls last`,
      desc(priorityRank),
      asc(tasks.createdAt),
    );
  return assembleMany(ctx.db, rows);
}

/** All open+recent tasks with due dates, for the calendar view. */
export async function tasksByDueDate(
  ctx: Ctx,
  from: string,
  to: string,
): Promise<TaskDTO[]> {
  const rows = await ctx.db
    .select({
      task: tasks,
      assignee: userLite,
      project: { name: projects.name, color: projects.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspace.id),
        sql`${tasks.dueDate} between ${from} and ${to}`,
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.position));
  return assembleMany(ctx.db, rows);
}

export interface TaskDetail {
  task: TaskDTO;
  comments: CommentDTO[];
  activity: ActivityDTO[];
}

export async function taskDetail(ctx: Ctx, taskId: string): Promise<TaskDetail> {
  const row = await requireTask(ctx, taskId);

  const [assigneeRows, commentRows, activityRows, labelMap, projectRow] =
    await Promise.all([
      row.assigneeId
        ? ctx.db.select(userLite).from(users).where(eq(users.id, row.assigneeId))
        : Promise.resolve([]),
      ctx.db
        .select({ comment: comments, author: userLite })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.taskId, taskId))
        .orderBy(asc(comments.createdAt)),
      ctx.db
        .select({ event: activityEvents, actor: userLite })
        .from(activityEvents)
        .leftJoin(users, eq(activityEvents.actorId, users.id))
        .where(eq(activityEvents.taskId, taskId))
        .orderBy(desc(activityEvents.createdAt))
        .limit(50),
      labelsForTasks(ctx.db, [taskId]),
      ctx.db
        .select({ name: projects.name, color: projects.color })
        .from(projects)
        .where(eq(projects.id, row.projectId)),
    ]);

  return {
    task: toDTO(row, assigneeRows[0] ?? null, labelMap.get(taskId) ?? [], projectRow[0]),
    comments: commentRows.map((c) => ({
      id: c.comment.id,
      taskId: c.comment.taskId,
      body: c.comment.body,
      createdAt: c.comment.createdAt.toISOString(),
      author: c.author,
    })),
    activity: activityRows.map((a) => ({
      id: a.event.id,
      type: a.event.type as ActivityDTO["type"],
      data: a.event.data,
      createdAt: a.event.createdAt.toISOString(),
      actor: a.actor,
    })),
  };
}

/* ------------------------------ mutations -------------------------------- */

async function nextPosition(
  ctx: Ctx,
  projectId: string,
  status: string,
): Promise<number> {
  const rows = await ctx.db
    .select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspace.id),
        eq(tasks.projectId, projectId),
        eq(tasks.status, status as TaskRow["status"]),
      ),
    );
  return (rows[0]?.max ?? 0) + 1024;
}

export async function createTask(
  ctx: Ctx,
  input: TaskCreateInput,
): Promise<TaskDTO> {
  const project = await requireProject(ctx, input.projectId);
  if (input.assigneeId) await assertMembersInWorkspace(ctx, [input.assigneeId]);
  await assertLabelsInWorkspace(ctx, input.labelIds);

  const position =
    input.position ?? (await nextPosition(ctx, input.projectId, input.status));
  const now = new Date();

  const inserted = await ctx.db
    .insert(tasks)
    .values({
      ...(input.id ? { id: input.id } : {}),
      workspaceId: ctx.workspace.id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority,
      position,
      createdBy: ctx.userId,
      completedAt: input.status === "done" ? now : null,
    })
    .onConflictDoNothing({ target: tasks.id }) // offline replays are idempotent
    .returning();

  const row = inserted[0];
  if (!row) {
    // Replayed create — return the existing row instead of duplicating.
    return (await taskDetail(ctx, input.id!)).task;
  }

  if (input.labelIds.length > 0) {
    await ctx.db
      .insert(taskLabels)
      .values(input.labelIds.map((labelId) => ({ taskId: row.id, labelId })));
  }

  const events: ActivityInput[] = [
    {
      workspaceId: ctx.workspace.id,
      type: "task_created",
      actorId: ctx.userId,
      projectId: row.projectId,
      taskId: row.id,
      data: { title: row.title },
    },
  ];
  if (row.status === "done") {
    events.push({
      workspaceId: ctx.workspace.id,
      type: "task_completed",
      actorId: ctx.userId,
      projectId: row.projectId,
      taskId: row.id,
      data: { title: row.title },
    });
  }
  await logActivity(ctx.db, events);

  if (row.assigneeId && row.assigneeId !== ctx.userId) {
    await notify(ctx.db, {
      workspaceId: ctx.workspace.id,
      userIds: [row.assigneeId],
      actorId: ctx.userId,
      type: "task_assigned",
      payload: {
        title: "New task for you",
        body: row.title,
        url: `/w/${ctx.workspace.slug}/p/${row.projectId}?task=${row.id}`,
        taskId: row.id,
      },
    });
  }

  const labelMap = await labelsForTasks(ctx.db, [row.id]);
  const assignee = row.assigneeId
    ? ((await ctx.db.select(userLite).from(users).where(eq(users.id, row.assigneeId)))[0] ?? null)
    : null;
  return toDTO(row, assignee, labelMap.get(row.id) ?? [], project);
}

export async function updateTask(
  ctx: Ctx,
  taskId: string,
  input: TaskUpdateInput,
): Promise<TaskDTO> {
  const existing = await requireTask(ctx, taskId);

  if (input.projectId && input.projectId !== existing.projectId) {
    await requireProject(ctx, input.projectId);
  }
  if (input.assigneeId) await assertMembersInWorkspace(ctx, [input.assigneeId]);
  if (input.labelIds) await assertLabelsInWorkspace(ctx, input.labelIds);

  const now = new Date();
  const events: ActivityInput[] = [];
  const base = {
    workspaceId: ctx.workspace.id,
    actorId: ctx.userId,
    projectId: input.projectId ?? existing.projectId,
    taskId,
  };

  const statusChanged =
    input.status !== undefined && input.status !== existing.status;
  const assigneeChanged =
    input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId;

  if (statusChanged) {
    if (input.status === "done") {
      events.push({ ...base, type: "task_completed", data: { title: existing.title } });
    } else if (existing.status === "done") {
      events.push({ ...base, type: "task_reopened", data: { title: existing.title } });
    } else {
      events.push({
        ...base,
        type: "task_status_changed",
        data: { from: existing.status, to: input.status },
      });
    }
  }
  if (assigneeChanged) {
    events.push({
      ...base,
      type: "task_assigned",
      data: { assigneeId: input.assigneeId, title: existing.title },
    });
  }

  const contentFields = (
    ["title", "description", "dueDate", "priority", "projectId", "labelIds"] as const
  ).filter((f) => input[f] !== undefined);
  if (contentFields.length > 0) {
    events.push({ ...base, type: "task_updated", data: { fields: contentFields } });
  }

  // A pure reorder (position only) is not "activity" — it would poison
  // staleness and spam the log.
  const meaningful = events.length > 0;

  const updated = await ctx.db
    .update(tasks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(statusChanged
        ? { completedAt: input.status === "done" ? now : null }
        : {}),
      updatedAt: now,
      ...(meaningful ? { lastActivityAt: now } : {}),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)))
    .returning();

  const row = updated[0];
  if (!row) throw new NotFoundError("Task not found");

  if (input.labelIds) {
    await ctx.db.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
    if (input.labelIds.length > 0) {
      await ctx.db
        .insert(taskLabels)
        .values(input.labelIds.map((labelId) => ({ taskId, labelId })));
    }
  }

  await logActivity(ctx.db, events);

  if (assigneeChanged && input.assigneeId && input.assigneeId !== ctx.userId) {
    await notify(ctx.db, {
      workspaceId: ctx.workspace.id,
      userIds: [input.assigneeId],
      actorId: ctx.userId,
      type: "task_assigned",
      payload: {
        title: "New task for you",
        body: row.title,
        url: `/w/${ctx.workspace.slug}/p/${row.projectId}?task=${row.id}`,
        taskId: row.id,
      },
    });
  }

  const labelMap = await labelsForTasks(ctx.db, [row.id]);
  const assignee = row.assigneeId
    ? ((await ctx.db.select(userLite).from(users).where(eq(users.id, row.assigneeId)))[0] ?? null)
    : null;
  return toDTO(row, assignee, labelMap.get(row.id) ?? []);
}

export async function deleteTask(ctx: Ctx, taskId: string): Promise<void> {
  const existing = await requireTask(ctx, taskId);
  await logActivity(ctx.db, {
    workspaceId: ctx.workspace.id,
    type: "task_deleted",
    actorId: ctx.userId,
    projectId: existing.projectId,
    data: { title: existing.title },
  });
  await ctx.db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
}
