/**
 * Time tracking (Phase 2): one running timer per person, stop-to-log, plus
 * manual "log 45m" entries. Minutes are the unit of truth (rounded up to a
 * whole minute so a quick start/stop never logs zero). No idle detection,
 * no screenshots, nothing surveillance-flavoured, the team tracks effort,
 * the tool never polices it.
 */
import { and, asc, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import { memberships, projects, tasks, timeEntries, users } from "@/server/db/schema";
import type { RunningTimerDTO, TaskTimeDTO, WeekTimeDTO } from "@/lib/types";
import { dayToDate, todaySAST, weekStart } from "@/lib/dates";
import { assertFeature, type Ctx } from "./context";
import { NotFoundError } from "./errors";

function minutesBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
}

async function requireTask(ctx: Ctx, taskId: string) {
  const [task] = await ctx.db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
  if (!task) throw new NotFoundError("Task not found");
  return task;
}

/** Close the caller's running entry, if any. Returns the minutes it logged. */
async function closeRunning(ctx: Ctx, now: Date): Promise<number | null> {
  const [running] = await ctx.db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, ctx.workspace.id),
        eq(timeEntries.userId, ctx.userId),
        isNull(timeEntries.endedAt),
      ),
    );
  if (!running) return null;
  const minutes = minutesBetween(running.startedAt, now);
  await ctx.db
    .update(timeEntries)
    .set({ endedAt: now, minutes })
    .where(eq(timeEntries.id, running.id));
  return minutes;
}

export async function startTimer(
  ctx: Ctx,
  taskId: string,
): Promise<{ id: string; startedAt: string }> {
  assertFeature(ctx, "time_tracking", "Time tracking");
  await requireTask(ctx, taskId);

  const now = new Date();
  await closeRunning(ctx, now); // switching tasks just works

  const [row] = await ctx.db
    .insert(timeEntries)
    .values({
      workspaceId: ctx.workspace.id,
      taskId,
      userId: ctx.userId,
      startedAt: now,
    })
    .returning({ id: timeEntries.id, startedAt: timeEntries.startedAt });
  return { id: row.id, startedAt: row.startedAt.toISOString() };
}

export async function stopTimer(
  ctx: Ctx,
): Promise<{ minutes: number }> {
  assertFeature(ctx, "time_tracking", "Time tracking");
  const minutes = await closeRunning(ctx, new Date());
  if (minutes === null) throw new NotFoundError("No timer is running");
  return { minutes };
}

export async function logTime(
  ctx: Ctx,
  input: { taskId: string; minutes: number; note?: string },
): Promise<{ id: string }> {
  assertFeature(ctx, "time_tracking", "Time tracking");
  await requireTask(ctx, input.taskId);

  const now = new Date();
  const [row] = await ctx.db
    .insert(timeEntries)
    .values({
      workspaceId: ctx.workspace.id,
      taskId: input.taskId,
      userId: ctx.userId,
      startedAt: now,
      endedAt: now,
      minutes: input.minutes,
      note: input.note ?? null,
    })
    .returning({ id: timeEntries.id });
  return { id: row.id };
}

/** The caller's running timer anywhere in the workspace (topbar chip). */
export async function runningTimer(ctx: Ctx): Promise<RunningTimerDTO | null> {
  const [row] = await ctx.db
    .select({
      id: timeEntries.id,
      taskId: timeEntries.taskId,
      startedAt: timeEntries.startedAt,
      taskTitle: tasks.title,
      projectId: tasks.projectId,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .where(
      and(
        eq(timeEntries.workspaceId, ctx.workspace.id),
        eq(timeEntries.userId, ctx.userId),
        isNull(timeEntries.endedAt),
      ),
    );
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    projectId: row.projectId,
    startedAt: row.startedAt.toISOString(),
  };
}

export async function taskTime(ctx: Ctx, taskId: string): Promise<TaskTimeDTO> {
  await requireTask(ctx, taskId);

  const [rows, [mine]] = await Promise.all([
    ctx.db
      .select({
        userId: timeEntries.userId,
        minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .where(
        and(
          eq(timeEntries.taskId, taskId),
          eq(timeEntries.workspaceId, ctx.workspace.id),
          sql`${timeEntries.minutes} is not null`,
        ),
      )
      .groupBy(timeEntries.userId, users.name, users.email, users.image),
    ctx.db
      .select({ id: timeEntries.id, startedAt: timeEntries.startedAt })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.taskId, taskId),
          eq(timeEntries.userId, ctx.userId),
          isNull(timeEntries.endedAt),
        ),
      ),
  ]);

  const byUser = rows
    .map((r) => ({
      user: { id: r.userId, name: r.name, email: r.email, image: r.image },
      minutes: Number(r.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes: byUser.reduce((sum, u) => sum + u.minutes, 0),
    byUser,
    running: mine ? { id: mine.id, startedAt: mine.startedAt.toISOString() } : null,
  };
}

/** This SAST week's logged time, whole workspace (dashboard card). */
export async function weekTime(
  db: Db,
  workspaceId: string,
  opts: { now?: Date } = {},
): Promise<WeekTimeDTO> {
  const today = todaySAST(opts.now ?? new Date());
  const from = dayToDate(weekStart(today));

  const rows = await db
    .select({
      userId: timeEntries.userId,
      projectId: tasks.projectId,
      minutes: timeEntries.minutes,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.startedAt, from),
        sql`${timeEntries.minutes} is not null`,
      ),
    );

  const byUserMin = new Map<string, number>();
  const byProjectMin = new Map<string, number>();
  let totalMinutes = 0;
  for (const r of rows) {
    const m = r.minutes ?? 0;
    totalMinutes += m;
    byUserMin.set(r.userId, (byUserMin.get(r.userId) ?? 0) + m);
    byProjectMin.set(r.projectId, (byProjectMin.get(r.projectId) ?? 0) + m);
  }

  const userIds = [...byUserMin.keys()];
  const projectIds = [...byProjectMin.keys()];
  const [userRows, projectRows] = await Promise.all([
    userIds.length > 0
      ? db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
    projectIds.length > 0
      ? db
          .select({ id: projects.id, name: projects.name, color: projects.color })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : Promise.resolve([]),
  ]);

  return {
    totalMinutes,
    byMember: userRows
      .map((u) => ({
        user: { id: u.id, name: u.name, email: u.email, image: u.image },
        minutes: byUserMin.get(u.id) ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    byProject: projectRows
      .map((p) => ({ ...p, minutes: byProjectMin.get(p.id) ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}
