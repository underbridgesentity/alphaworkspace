/**
 * The daily pre-work job (early morning SAST):
 *  1. Precompute + cache morning briefs (Team/Studio feature) and push them
 *     to users who opted in. Deliberately NOT an in-app notification row —
 *     a daily bell ping for something the home screen already shows would
 *     violate the anti-noise law.
 *  2. One batched due-today/newly-overdue nudge per user per workspace —
 *     a single summary, never one ping per task.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  dailyBriefs,
  memberships,
  projects,
  tasks,
  users,
  workspaces,
} from "@/server/db/schema";
import { can } from "@/lib/plans";
import { addDays, todaySAST } from "@/lib/dates";
import { briefItemsForUser } from "@/server/kpi";
import { composeMorningBrief } from "@/server/ai/brief";
import { notify } from "@/server/notifications/service";
import { pushChannel } from "@/server/notifications/channels/push";

export interface MorningRunResult {
  briefs: number;
  nudged: number;
}

export async function runMorningJobs(
  db: Db,
  opts: { now?: Date } = {},
): Promise<MorningRunResult> {
  const now = opts.now ?? new Date();
  const today = todaySAST(now);
  const yesterday = addDays(today, -1);

  const rows = await db
    .select({
      userId: memberships.userId,
      userName: users.name,
      prefs: users.notificationPrefs,
      workspaceId: workspaces.id,
      slug: workspaces.slug,
      wsName: workspaces.name,
      plan: workspaces.plan,
      entitlements: workspaces.entitlements,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .innerJoin(users, eq(memberships.userId, users.id));

  let briefs = 0;
  let nudged = 0;

  for (const row of rows) {
    try {
      /* ---- morning brief (entitlement-gated) ---- */
      if (can(row.plan, "morning_brief", row.entitlements)) {
        const data = await briefItemsForUser(db, row.workspaceId, row.userId, { now });
        const content = composeMorningBrief({
          userName: row.userName,
          ...data,
        });
        const inserted = await db
          .insert(dailyBriefs)
          .values({
            userId: row.userId,
            workspaceId: row.workspaceId,
            day: today,
            content: content as unknown as Record<string, unknown>,
          })
          .onConflictDoNothing({
            target: [dailyBriefs.userId, dailyBriefs.workspaceId, dailyBriefs.day],
          })
          .returning({ id: dailyBriefs.id });

        if (inserted[0]) {
          briefs++;
          // Push only for explicit opt-ins; no in-app row by design.
          if (row.prefs?.morning_brief?.push === true && data.items.length > 0) {
            await pushChannel.send(
              db,
              { id: row.userId, email: "", name: row.userName },
              {
                workspaceId: row.workspaceId,
                userIds: [row.userId],
                type: "morning_brief",
                payload: {
                  title: content.headline,
                  body: content.items.map((i) => `• ${i.title}`).join("\n"),
                  url: `/w/${row.slug}`,
                },
              },
            );
          }
        }
      }

      /* ---- batched due-today / newly-overdue nudges ---- */
      const mine = await db
        .select({ title: tasks.title, dueDate: tasks.dueDate })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(
          and(
            eq(tasks.workspaceId, row.workspaceId),
            eq(tasks.assigneeId, row.userId),
            ne(tasks.status, "done"),
            eq(projects.status, "active"),
            inArray(tasks.dueDate, [today, yesterday]),
          ),
        );

      const dueToday = mine.filter((t) => t.dueDate === today);
      const newlyOverdue = mine.filter((t) => t.dueDate === yesterday);

      if (dueToday.length > 0) {
        await notify(db, {
          workspaceId: row.workspaceId,
          userIds: [row.userId],
          type: "task_due_soon",
          payload: {
            title:
              dueToday.length === 1
                ? `Due today: ${dueToday[0].title}`
                : `${dueToday.length} tasks due today`,
            body: dueToday.map((t) => t.title).slice(0, 5).join(" · "),
            url: `/w/${row.slug}`,
          },
        });
        nudged++;
      }
      if (newlyOverdue.length > 0) {
        await notify(db, {
          workspaceId: row.workspaceId,
          userIds: [row.userId],
          type: "task_overdue",
          payload: {
            title:
              newlyOverdue.length === 1
                ? `Slipped past due: ${newlyOverdue[0].title}`
                : `${newlyOverdue.length} tasks slipped past due yesterday`,
            body: newlyOverdue.map((t) => t.title).slice(0, 5).join(" · "),
            url: `/w/${row.slug}`,
          },
        });
        nudged++;
      }
    } catch (err) {
      console.error(
        `[morning] failed for user ${row.userId} in ${row.workspaceId}`,
        err,
      );
    }
  }

  return { briefs, nudged };
}
