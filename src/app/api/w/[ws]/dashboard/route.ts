import { desc, eq } from "drizzle-orm";
import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { db } from "@/server/db";
import { narrativeReports } from "@/server/db/schema";
import { memberPerformance, projectKpis, workspaceKpis } from "@/server/kpi";
import { ctxEntitlements } from "@/server/dal/context";
import { listScorecards } from "@/server/dal/scorecards";
import { weekTime } from "@/server/dal/time";

/** Zero-setup KPIs + the latest narrative. ?project=<id> scopes the KPIs. */
export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const projectId = new URL(req.url).searchParams.get("project");
  const features = ctxEntitlements(ctx).features;

  // Per-person performance (the workload breakdown and business scorecards)
  // is management data: a manager's tool for evaluating the team, not
  // something a peer should see. Owner/admin only. Members still get the
  // team-level momentum and the weekly narrative.
  const isManager = ctx.role === "owner" || ctx.role === "admin";

  const [kpis, people, scorecards, timeWeek, narratives] = await Promise.all([
    projectId
      ? projectKpis(ctx.db, ctx.workspace.id, projectId)
      : workspaceKpis(ctx.db, ctx.workspace.id),
    !projectId && isManager
      ? memberPerformance(ctx.db, ctx.workspace.id)
      : Promise.resolve(undefined),
    !projectId && isManager && features.includes("scorecards")
      ? listScorecards(ctx)
      : Promise.resolve(undefined),
    !projectId && isManager && features.includes("time_tracking")
      ? weekTime(ctx.db, ctx.workspace.id)
      : Promise.resolve(undefined),
    db
      .select({
        id: narrativeReports.id,
        weekStart: narrativeReports.weekStart,
        weekEnd: narrativeReports.weekEnd,
        narrative: narrativeReports.narrative,
        engine: narrativeReports.engine,
        createdAt: narrativeReports.createdAt,
      })
      .from(narrativeReports)
      .where(eq(narrativeReports.workspaceId, ctx.workspace.id))
      .orderBy(desc(narrativeReports.weekStart))
      .limit(8),
  ]);

  // Strip the per-person breakdown for non-managers (defence in depth; the
  // UI also hides it).
  if (!isManager && kpis) kpis.memberLoad = [];

  return json({ kpis, people, scorecards, timeWeek, narratives });
});
