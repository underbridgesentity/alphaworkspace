import { desc, eq } from "drizzle-orm";
import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { db } from "@/server/db";
import { narrativeReports } from "@/server/db/schema";
import { projectKpis, workspaceKpis } from "@/server/kpi";

/** Zero-setup KPIs + the latest narrative. ?project=<id> scopes the KPIs. */
export const GET = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const projectId = new URL(req.url).searchParams.get("project");

  const [kpis, narratives] = await Promise.all([
    projectId
      ? projectKpis(ctx.db, ctx.workspace.id, projectId)
      : workspaceKpis(ctx.db, ctx.workspace.id),
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

  return json({ kpis, narratives });
});
