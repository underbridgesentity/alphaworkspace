/**
 * Ranks a user's day for the morning brief: overdue (oldest first), due
 * today, in progress, stale, then nearest up-next.
 */
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import { projects, tasks } from "@/server/db/schema";
import type { BriefItem } from "@/lib/types";
import { todaySAST } from "@/lib/dates";
import { staleDaysFor } from "./compute";

export async function briefItemsForUser(
  db: Db,
  workspaceId: string,
  userId: string,
  opts: { now?: Date } = {},
): Promise<{ items: BriefItem[]; overdueCount: number; dueTodayCount: number }> {
  const now = opts.now ?? new Date();
  const today = todaySAST(now);
  const staleDays = await staleDaysFor(db, workspaceId);
  const staleBefore = new Date(now.getTime() - staleDays * 86_400_000);

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
      lastActivityAt: tasks.lastActivityAt,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.assigneeId, userId),
        ne(tasks.status, "done"),
        eq(projects.status, "active"),
      ),
    );

  const reason = (r: (typeof rows)[number]): BriefItem["reason"] => {
    if (r.dueDate && r.dueDate < today) return "overdue";
    if (r.dueDate === today) return "due_today";
    if (r.status === "in_progress") return "in_progress";
    if (r.lastActivityAt < staleBefore) return "stale";
    return "up_next";
  };

  const rank: Record<BriefItem["reason"], number> = {
    overdue: 0,
    due_today: 1,
    in_progress: 2,
    stale: 3,
    up_next: 4,
  };

  const items = rows
    .map((r) => ({
      taskId: r.id,
      title: r.title,
      projectName: r.projectName,
      reason: reason(r),
      dueDate: r.dueDate,
    }))
    .sort((a, b) => {
      if (rank[a.reason] !== rank[b.reason]) return rank[a.reason] - rank[b.reason];
      if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  return {
    items: items.slice(0, 5),
    overdueCount: items.filter((i) => i.reason === "overdue").length,
    dueTodayCount: items.filter((i) => i.reason === "due_today").length,
  };
}
