/**
 * Zero-setup KPI computations, straight from activity_events + task state.
 *
 * These functions take (db, workspaceId) rather than a user Ctx because the
 * cron jobs call them without a session. API routes MUST resolve workspace
 * membership first (withWorkspace) and pass ctx.workspace.id, never a raw
 * param.
 *
 * Conventions: all "day" values are YYYY-MM-DD in Africa/Johannesburg; weeks
 * start Monday; `now` is injectable for tests.
 */
import { and, avg, count, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  activityEvents,
  memberships,
  projects,
  tasks,
  users,
  workspaces,
} from "@/server/db/schema";
import type { WorkspaceKpis } from "@/lib/types";
import { addDays, dayToDate, toDayString, todaySAST, weekStart } from "@/lib/dates";

export const DEFAULT_STALE_DAYS = 5;

export async function staleDaysFor(db: Db, workspaceId: string): Promise<number> {
  const [ws] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  return ws?.settings?.staleDays ?? DEFAULT_STALE_DAYS;
}

interface KpiOpts {
  now?: Date;
  /** Limit everything to one project (projectKpis). */
  projectId?: string;
}

/** Count of activity events of a type inside [from, to). */
async function eventCount(
  db: Db,
  workspaceId: string,
  type: string,
  from: Date,
  to: Date,
  projectId?: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        eq(activityEvents.type, type),
        gte(activityEvents.createdAt, from),
        lt(activityEvents.createdAt, to),
        projectId ? eq(activityEvents.projectId, projectId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

export async function workspaceKpis(
  db: Db,
  workspaceId: string,
  opts: KpiOpts = {},
): Promise<WorkspaceKpis> {
  const now = opts.now ?? new Date();
  const today = todaySAST(now);
  const weekStartDay = weekStart(today);
  const windowFrom = dayToDate(weekStartDay);
  const windowTo = dayToDate(addDays(weekStartDay, 7));
  const staleDays = await staleDaysFor(db, workspaceId);
  const staleBefore = new Date(now.getTime() - staleDays * 86_400_000);
  const projectFilter = opts.projectId
    ? eq(tasks.projectId, opts.projectId)
    : undefined;

  // Completed/created this week come from the append-only log (survives
  // deletion); "now" numbers come from live task state in active projects.
  const [completedThisWeek, createdThisWeek] = await Promise.all([
    eventCount(db, workspaceId, "task_completed", windowFrom, windowTo, opts.projectId),
    eventCount(db, workspaceId, "task_created", windowFrom, windowTo, opts.projectId),
  ]);

  const openWhere = and(
    eq(tasks.workspaceId, workspaceId),
    ne(tasks.status, "done"),
    eq(projects.status, "active"),
    projectFilter,
  );

  const [openRow] = await db
    .select({
      open: count(),
      overdue: count(sql`case when ${tasks.dueDate} < ${today} then 1 end`),
      stale: count(
        sql`case when ${tasks.lastActivityAt} < ${staleBefore.toISOString()} then 1 end`,
      ),
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(openWhere);

  const openNow = openRow?.open ?? 0;
  const overdueNow = openRow?.overdue ?? 0;
  const staleNow = openRow?.stale ?? 0;

  // Average creation→done for tasks completed inside the window (days, 1dp).
  const [cycleRow] = await db
    .select({
      avgSeconds: avg(
        sql`extract(epoch from (${tasks.completedAt} - ${tasks.createdAt}))`,
      ),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        gte(tasks.completedAt, windowFrom),
        lt(tasks.completedAt, windowTo),
        projectFilter,
      ),
    );
  const avgCycleTimeDays =
    cycleRow?.avgSeconds != null
      ? Math.round((Number(cycleRow.avgSeconds) / 86_400) * 10) / 10
      : null;

  // Per-member open load (includes zero-load members, the point is seeing
  // the imbalance). Two simple queries merged in JS beat one clever join.
  const [memberRows, loadRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, workspaceId)),
    db
      .select({
        assigneeId: tasks.assigneeId,
        open: count(),
        overdue: count(sql`case when ${tasks.dueDate} < ${today} then 1 end`),
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          openWhere,
          sql`${tasks.assigneeId} is not null`,
        ),
      )
      .groupBy(tasks.assigneeId),
  ]);
  const loadByUser = new Map(loadRows.map((r) => [r.assigneeId, r]));
  const memberLoad = memberRows
    .map((m) => ({
      user: { id: m.id, name: m.name, email: m.email, image: m.image },
      open: loadByUser.get(m.id)?.open ?? 0,
      overdue: loadByUser.get(m.id)?.overdue ?? 0,
    }))
    .sort((a, b) => b.open - a.open);

  // Throughput: completions bucketed into the last 8 SAST weeks.
  const eightWeeksAgo = dayToDate(addDays(weekStartDay, -49));
  const completionRows = await db
    .select({ createdAt: activityEvents.createdAt })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        eq(activityEvents.type, "task_completed"),
        gte(activityEvents.createdAt, eightWeeksAgo),
        opts.projectId ? eq(activityEvents.projectId, opts.projectId) : undefined,
      ),
    );
  const buckets = new Map<string, number>();
  for (let i = 7; i >= 0; i--) {
    buckets.set(addDays(weekStartDay, -7 * i), 0);
  }
  for (const row of completionRows) {
    const bucket = weekStart(toDayString(row.createdAt));
    if (buckets.has(bucket)) buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const throughputByWeek = [...buckets.entries()].map(([ws, completed]) => ({
    weekStart: ws,
    completed,
  }));

  // Same event rows bucketed per SAST day, last 28 days (momentum blocks).
  const dayBuckets = new Map<string, number>();
  for (let i = 27; i >= 0; i--) dayBuckets.set(addDays(today, -i), 0);
  for (const row of completionRows) {
    const day = toDayString(row.createdAt);
    if (dayBuckets.has(day)) dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
  }
  const completionsByDay = [...dayBuckets.entries()].map(([day, completed]) => ({
    day,
    completed,
  }));

  // "Of everything on the plate this week, what share got done":
  // completed / (completed + still open now).
  const denominator = completedThisWeek + openNow;
  const completionRatePct =
    denominator > 0 ? Math.round((completedThisWeek / denominator) * 100) : null;

  return {
    completionRatePct,
    completedThisWeek,
    createdThisWeek,
    overdueNow,
    avgCycleTimeDays,
    staleNow,
    openNow,
    memberLoad,
    throughputByWeek,
    completionsByDay,
  };
}

export async function projectKpis(
  db: Db,
  workspaceId: string,
  projectId: string,
  opts: Omit<KpiOpts, "projectId"> = {},
): Promise<WorkspaceKpis> {
  return workspaceKpis(db, workspaceId, { ...opts, projectId });
}

/** Members of a workspace with their completion counts inside a window. */
export async function memberCompletions(
  db: Db,
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ actorId: activityEvents.actorId, n: count() })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        eq(activityEvents.type, "task_completed"),
        gte(activityEvents.createdAt, from),
        lt(activityEvents.createdAt, to),
      ),
    )
    .groupBy(activityEvents.actorId);
  const map = new Map<string, number>();
  for (const r of rows) if (r.actorId) map.set(r.actorId, r.n);
  return map;
}

/** Latest activity timestamp per project (for "gone quiet" detection). */
export async function lastActivityByProject(
  db: Db,
  workspaceId: string,
  projectIds: string[],
): Promise<Map<string, Date>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: activityEvents.projectId,
      last: sql<string>`max(${activityEvents.createdAt})`,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        inArray(activityEvents.projectId, projectIds),
      ),
    )
    .groupBy(activityEvents.projectId);
  const map = new Map<string, Date>();
  for (const r of rows) {
    if (r.projectId && r.last) map.set(r.projectId, new Date(r.last));
  }
  return map;
}
