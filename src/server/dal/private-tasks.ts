/**
 * Private tasks: a member's personal list inside a workspace. The wall is
 * the meetings wall, owner-only with admins included, and every miss is a
 * NotFoundError indistinguishable from "doesn't exist". The table is
 * separate from `tasks` on purpose (shared surfaces never query it), and no
 * activity_events are written for private items, the log is team-visible.
 *
 * Promotion is the one door out: it creates an ordinary workspace task via
 * createTask (which logs task_created like any create) and removes the
 * private row.
 */
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { privateTasks } from "@/server/db/schema";
import type { PrivateTaskDTO, TaskDTO } from "@/lib/types";
import type { Ctx } from "./context";
import { createTask } from "./tasks";
import { NotFoundError } from "./errors";

type Row = typeof privateTasks.$inferSelect;

/** Only the owner passes; a teammate's or admin's id misses the WHERE. */
function ownerOnly(ctx: Ctx, id: string) {
  return and(
    eq(privateTasks.id, id),
    eq(privateTasks.workspaceId, ctx.workspace.id),
    eq(privateTasks.userId, ctx.userId),
  );
}

function toDTO(row: Row): PrivateTaskDTO {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    dueDate: row.dueDate,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Open items due-date first (nulls last), then a tail of recent done ones. */
export async function listPrivateTasks(ctx: Ctx): Promise<PrivateTaskDTO[]> {
  const mine = and(
    eq(privateTasks.workspaceId, ctx.workspace.id),
    eq(privateTasks.userId, ctx.userId),
  );
  const [open, done] = await Promise.all([
    ctx.db
      .select()
      .from(privateTasks)
      .where(and(mine, isNull(privateTasks.completedAt)))
      // Postgres sorts NULLs last on ASC, so undated items settle at the end.
      .orderBy(asc(privateTasks.dueDate), asc(privateTasks.createdAt))
      .limit(200),
    ctx.db
      .select()
      .from(privateTasks)
      .where(and(mine, isNotNull(privateTasks.completedAt)))
      .orderBy(desc(privateTasks.completedAt))
      .limit(30),
  ]);
  return [...open, ...done].map(toDTO);
}

export async function createPrivateTask(
  ctx: Ctx,
  input: { id?: string; title: string; note: string; dueDate?: string | null },
): Promise<PrivateTaskDTO> {
  const inserted = await ctx.db
    .insert(privateTasks)
    .values({
      ...(input.id ? { id: input.id } : {}),
      workspaceId: ctx.workspace.id,
      userId: ctx.userId,
      title: input.title,
      note: input.note,
      dueDate: input.dueDate ?? null,
    })
    .onConflictDoNothing({ target: privateTasks.id }) // offline replays
    .returning();
  if (inserted[0]) return toDTO(inserted[0]);
  // Replayed create: return the existing row, owner-scoped.
  const [existing] = await ctx.db
    .select()
    .from(privateTasks)
    .where(ownerOnly(ctx, input.id!));
  if (!existing) throw new NotFoundError("Private task not found");
  return toDTO(existing);
}

export async function updatePrivateTask(
  ctx: Ctx,
  id: string,
  patch: { title?: string; note?: string; dueDate?: string | null; done?: boolean },
): Promise<PrivateTaskDTO> {
  const next: Partial<typeof privateTasks.$inferInsert> = {};
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.note !== undefined) next.note = patch.note;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.done !== undefined) next.completedAt = patch.done ? new Date() : null;

  const [row] = await ctx.db
    .update(privateTasks)
    .set(next)
    .where(ownerOnly(ctx, id))
    .returning();
  if (!row) throw new NotFoundError("Private task not found");
  return toDTO(row);
}

export async function deletePrivateTask(ctx: Ctx, id: string): Promise<void> {
  const [row] = await ctx.db
    .delete(privateTasks)
    .where(ownerOnly(ctx, id))
    .returning({ id: privateTasks.id });
  if (!row) throw new NotFoundError("Private task not found");
}

/**
 * The door to the team: create a real task in one of the caller's projects
 * (createTask re-validates project, assignee and workspace), then remove the
 * private row. Sequential, not transactional; the failure window leaves a
 * duplicate private item at worst, never a leak.
 */
export async function promotePrivateTask(
  ctx: Ctx,
  id: string,
  input: { projectId: string; assigneeId?: string | null; dueDate?: string | null },
): Promise<TaskDTO> {
  const [row] = await ctx.db
    .select()
    .from(privateTasks)
    .where(ownerOnly(ctx, id));
  if (!row) throw new NotFoundError("Private task not found");

  const task = await createTask(ctx, {
    projectId: input.projectId,
    title: row.title,
    description: row.note,
    status: "todo",
    assigneeId: input.assigneeId ?? ctx.userId,
    dueDate: input.dueDate !== undefined ? input.dueDate : row.dueDate,
    priority: "none",
    labelIds: [],
  });

  // ownerOnly again so the scope is local to the statement, not just the
  // fetch above; a future edit between the two can't widen it.
  await ctx.db.delete(privateTasks).where(ownerOnly(ctx, row.id));
  return task;
}
