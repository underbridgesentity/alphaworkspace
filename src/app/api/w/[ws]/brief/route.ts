import { and, eq } from "drizzle-orm";
import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { dailyBriefs, users } from "@/server/db/schema";
import { can } from "@/lib/plans";
import { todaySAST } from "@/lib/dates";
import { briefItemsForUser } from "@/server/kpi";
import { composeMorningBrief } from "@/server/ai/brief";
import type { MorningBriefContent } from "@/lib/types";

/**
 * Today's morning brief for the signed-in user, cached once per user per
 * day (the cron precomputes; this computes on first open if needed).
 */
export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);

  if (!can(ctx.workspace.plan, "morning_brief", ctx.workspace.entitlements)) {
    return json({ entitled: false, brief: null });
  }

  const today = todaySAST();
  const [cached] = await ctx.db
    .select({ content: dailyBriefs.content })
    .from(dailyBriefs)
    .where(
      and(
        eq(dailyBriefs.userId, ctx.userId),
        eq(dailyBriefs.workspaceId, ctx.workspace.id),
        eq(dailyBriefs.day, today),
      ),
    );

  if (cached) {
    return json({ entitled: true, brief: cached.content as unknown as MorningBriefContent });
  }

  const [data, [me]] = await Promise.all([
    briefItemsForUser(ctx.db, ctx.workspace.id, ctx.userId),
    ctx.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, ctx.userId)),
  ]);
  const content = composeMorningBrief({
    userName: me?.name ?? null,
    ...data,
  });

  await ctx.db
    .insert(dailyBriefs)
    .values({
      userId: ctx.userId,
      workspaceId: ctx.workspace.id,
      day: today,
      content: content as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [dailyBriefs.userId, dailyBriefs.workspaceId, dailyBriefs.day],
    });

  return json({ entitled: true, brief: content });
});
