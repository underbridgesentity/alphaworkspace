/**
 * The Monday 06:30 SAST job, generates each workspace's weekly narrative
 * from the compiled summary, stores it with its input for auditability, and
 * delivers it in-app / push / email. Idempotent per workspace+week, so cron
 * retries are safe.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import {
  memberships,
  narrativeReports,
  workspaces,
} from "@/server/db/schema";
import { addDays, todaySAST, weekStart } from "@/lib/dates";
import { compileWeeklySummary } from "@/server/kpi";
import { composeNarrative } from "@/server/ai/narrative";
import { notify } from "@/server/notifications/service";

export interface NarrativeRunResult {
  workspaces: number;
  generated: number;
  skipped: number;
}

export async function runWeeklyNarratives(
  db: Db,
  opts: { now?: Date } = {},
): Promise<NarrativeRunResult> {
  const now = opts.now ?? new Date();
  // Run on Monday for the week that just ended.
  const thisWeek = weekStart(todaySAST(now));
  const weekStartDay = addDays(thisWeek, -7);

  const allWorkspaces = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
    .from(workspaces);

  let generated = 0;
  let skipped = 0;

  for (const ws of allWorkspaces) {
    try {
      const summary = await compileWeeklySummary(db, ws.id, weekStartDay, { now });

      // Dead-quiet workspace with nothing open: skip rather than spam.
      if (
        summary.totals.completed === 0 &&
        summary.totals.created === 0 &&
        summary.totals.openNow === 0
      ) {
        skipped++;
        continue;
      }

      const { narrative, engine } = await composeNarrative(summary);

      const inserted = await db
        .insert(narrativeReports)
        .values({
          workspaceId: ws.id,
          weekStart: weekStartDay,
          weekEnd: addDays(weekStartDay, 6),
          inputSummary: summary as unknown as Record<string, unknown>,
          narrative,
          engine,
        })
        .onConflictDoNothing({
          target: [narrativeReports.workspaceId, narrativeReports.weekStart],
        })
        .returning({ id: narrativeReports.id });

      if (!inserted[0]) {
        skipped++; // already generated this week (idempotent retry)
        continue;
      }
      generated++;

      const members = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.workspaceId, ws.id));

      await notify(db, {
        workspaceId: ws.id,
        userIds: members.map((m) => m.userId),
        type: "narrative_ready",
        payload: {
          title: `Monday briefing, ${ws.name}`,
          body: narrative,
          url: `/w/${ws.slug}/dashboard`,
        },
      });
    } catch (err) {
      console.error(`[narrative] failed for workspace ${ws.id}`, err);
      skipped++;
    }
  }

  return { workspaces: allWorkspaces.length, generated, skipped };
}
