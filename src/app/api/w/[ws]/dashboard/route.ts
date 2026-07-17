import { desc, eq } from "drizzle-orm";
import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { db } from "@/server/db";
import { narrativeReports } from "@/server/db/schema";
import { projectKpis, workspaceKpis } from "@/server/kpi";
import { ctxEntitlements } from "@/server/dal/context";
import { listScorecards } from "@/server/dal/scorecards";
import { weekTime } from "@/server/dal/time";

/** Zero-setup KPIs + the latest narrative. ?project=<id> scopes the KPIs. */
export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const projectId = new URL(req.url).searchParams.get("project");
  const features = ctxEntitlements(ctx).features;

  const [kpis, scorecards, timeWeek, narratives] = await Promise.all([
    projectId
      ? projectKpis(ctx.db, ctx.workspace.id, projectId)
      : workspaceKpis(ctx.db, ctx.workspace.id),
    !projectId && features.includes("scorecards")
      ? listScorecards(ctx)
      : Promise.resolve(undefined),
    !projectId && features.includes("time_tracking")
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

  return json({ kpis, scorecards, timeWeek, narratives });
});
