import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { assertRole } from "@/server/dal/context";
import { RateLimitError } from "@/server/dal/errors";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { compileWeeklySummary } from "@/server/kpi";
import { composeNarrative } from "@/server/ai/narrative";
import { todaySAST, weekStart } from "@/lib/dates";

/**
 * Admin-only on-demand preview of the current (partial) week's narrative.
 * Not stored — the real one lands Monday 06:30. Exists so a new team can
 * taste the flagship before their first Monday.
 */
export const POST = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  assertRole(ctx, "admin");
  if (!checkRateLimit(`narrative-preview:${ctx.workspace.id}`, 3, 10 * 60_000)) {
    throw new RateLimitError("Preview limit reached — try again in a few minutes");
  }

  const summary = await compileWeeklySummary(
    ctx.db,
    ctx.workspace.id,
    weekStart(todaySAST()),
  );
  const { narrative, engine } = await composeNarrative(summary);
  return json({ narrative, engine, weekStart: summary.weekStart });
});
