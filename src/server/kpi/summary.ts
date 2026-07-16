/**
 * Compiles the compact weekly summary the narrative model is prompted with —
 * its entire world view. Accuracy over cleverness; strictly one workspace.
 */
import { and, asc, eq, gte, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  memberships,
  projects,
  tasks,
  users,
  workspaces,
} from "@/server/db/schema";
import type { WeeklySummary } from "@/lib/types";
import { addDays, dayToDate, diffDays, todaySAST } from "@/lib/dates";
import {
  lastActivityByProject,
  memberCompletions,
  staleDaysFor,
  workspaceKpis,
} from "./compute";
import { activityEvents } from "@/server/db/schema";
import { count, lt, sql } from "drizzle-orm";

export async function compileWeeklySummary(
  db: Db,
  workspaceId: string,
  weekStartDay: string,
  opts: { now?: Date } = {},
): Promise<WeeklySummary> {
  const now = opts.now ?? new Date();
  const today = todaySAST(now);
  const windowFrom = dayToDate(weekStartDay);
  const windowTo = dayToDate(addDays(weekStartDay, 7));
  const staleDays = await staleDaysFor(db, workspaceId);
  const staleBefore = new Date(now.getTime() - staleDays * 86_400_000);

  const [ws] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const kpis = await workspaceKpis(db, workspaceId, { now });

  /* ---- members ---- */
  const [memberRows, completions] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, workspaceId)),
    memberCompletions(db, workspaceId, windowFrom, windowTo),
  ]);
  const loadByUser = new Map(
    kpis.memberLoad.map((m) => [m.user.id, m]),
  );
  const members = memberRows
    .map((m) => ({
      name: m.name ?? m.email.split("@")[0],
      completed: completions.get(m.id) ?? 0,
      open: loadByUser.get(m.id)?.open ?? 0,
      overdue: loadByUser.get(m.id)?.overdue ?? 0,
    }))
    .sort((a, b) => b.completed - a.completed);

  /* ---- projects ---- */
  const activeProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      clientName: projects.clientName,
    })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.status, "active")),
    );
  const projectIds = activeProjects.map((p) => p.id);

  const [taskAgg, completedByProject, lastActivity, dueNextRows] =
    await Promise.all([
      projectIds.length > 0
        ? db
            .select({
              projectId: tasks.projectId,
              open: count(),
              overdue: count(sql`case when ${tasks.dueDate} < ${today} then 1 end`),
              stale: count(
                sql`case when ${tasks.lastActivityAt} < ${staleBefore} then 1 end`,
              ),
            })
            .from(tasks)
            .where(
              and(eq(tasks.workspaceId, workspaceId), ne(tasks.status, "done")),
            )
            .groupBy(tasks.projectId)
        : Promise.resolve([]),
      projectIds.length > 0
        ? db
            .select({ projectId: activityEvents.projectId, n: count() })
            .from(activityEvents)
            .where(
              and(
                eq(activityEvents.workspaceId, workspaceId),
                eq(activityEvents.type, "task_completed"),
                gte(activityEvents.createdAt, windowFrom),
                lt(activityEvents.createdAt, windowTo),
              ),
            )
            .groupBy(activityEvents.projectId)
        : Promise.resolve([]),
      lastActivityByProject(db, workspaceId, projectIds),
      db
        .select({
          projectId: tasks.projectId,
          title: tasks.title,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            ne(tasks.status, "done"),
            gte(tasks.dueDate, today),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(60),
    ]);

  const aggByProject = new Map(taskAgg.map((r) => [r.projectId, r]));
  const completedMap = new Map(
    completedByProject
      .filter((r) => r.projectId)
      .map((r) => [r.projectId as string, r.n]),
  );

  const summaryProjects = activeProjects
    .map((p) => {
      const agg = aggByProject.get(p.id);
      const last = lastActivity.get(p.id);
      return {
        name: p.name,
        clientName: p.clientName,
        completed: completedMap.get(p.id) ?? 0,
        open: agg?.open ?? 0,
        overdue: agg?.overdue ?? 0,
        stale: agg?.stale ?? 0,
        daysSinceActivity: last
          ? Math.max(
              0,
              diffDays(
                `${last.toISOString().slice(0, 10)}`,
                today,
              ),
            )
          : null,
        dueNext: dueNextRows
          .filter((d) => d.projectId === p.id && d.dueDate)
          .slice(0, 3)
          .map((d) => ({ title: d.title, dueDate: d.dueDate as string })),
      };
    })
    .sort((a, b) => b.open - a.open);

  return {
    workspaceName: ws?.name ?? "Workspace",
    weekStart: weekStartDay,
    weekEnd: addDays(weekStartDay, 6),
    totals: {
      completed: kpis.completedThisWeek,
      created: kpis.createdThisWeek,
      overdueNow: kpis.overdueNow,
      staleNow: kpis.staleNow,
      openNow: kpis.openNow,
      activeProjects: activeProjects.length,
      completionRatePct: kpis.completionRatePct,
      avgCycleTimeDays: kpis.avgCycleTimeDays,
    },
    throughputByWeek: kpis.throughputByWeek,
    members,
    projects: summaryProjects,
  };
}
