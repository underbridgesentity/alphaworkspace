/**
 * Scorecards (Phase 2): the handful of business numbers a team tracks by
 * hand, weekly or monthly, beside the zero-setup KPIs. Values live in
 * kpi_entries, one per definition + period, upserts only, no history
 * rewriting. Reads never gate (data stays visible after a downgrade);
 * mutations require the "scorecards" feature (Team and up, see plans.ts).
 */
import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { kpiDefinitions, kpiEntries } from "@/server/db/schema";
import type { ScorecardDTO, ScorecardPeriod, ScorecardUnit } from "@/lib/types";
import { addDays, todaySAST, weekStart } from "@/lib/dates";
import { assertFeature, assertRole, type Ctx } from "./context";
import { NotFoundError, ValidationError } from "./errors";

const MAX_ACTIVE = 12; // a wall of numbers is noise, not signal

export function periodStartFor(period: ScorecardPeriod, day: string): string {
  return period === "weekly" ? weekStart(day) : `${day.slice(0, 7)}-01`;
}

function assertAligned(period: ScorecardPeriod, periodStart: string): void {
  if (periodStartFor(period, periodStart) !== periodStart) {
    throw new ValidationError(
      period === "weekly"
        ? "Weekly values start on a Monday"
        : "Monthly values start on the 1st",
    );
  }
}

export async function listScorecards(ctx: Ctx): Promise<ScorecardDTO[]> {
  const today = todaySAST();
  const defs = await ctx.db
    .select()
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.workspaceId, ctx.workspace.id),
        isNull(kpiDefinitions.archivedAt),
      ),
    )
    .orderBy(asc(kpiDefinitions.createdAt));
  if (defs.length === 0) return [];

  // Last 8 weekly periods cover 56 days; reuse the same horizon for monthly.
  const horizon = addDays(today, -8 * 31);
  const entryRows = await ctx.db
    .select({
      definitionId: kpiEntries.definitionId,
      periodStart: kpiEntries.periodStart,
      value: kpiEntries.value,
    })
    .from(kpiEntries)
    .where(
      and(
        eq(kpiEntries.workspaceId, ctx.workspace.id),
        inArray(kpiEntries.definitionId, defs.map((d) => d.id)),
        gte(kpiEntries.periodStart, horizon),
      ),
    )
    .orderBy(asc(kpiEntries.periodStart));

  const byDef = new Map<string, { periodStart: string; value: number }[]>();
  for (const e of entryRows) {
    const list = byDef.get(e.definitionId) ?? [];
    list.push({ periodStart: e.periodStart, value: e.value });
    byDef.set(e.definitionId, list);
  }

  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    unit: d.unit as ScorecardUnit,
    target: d.target,
    period: d.period,
    entries: (byDef.get(d.id) ?? []).slice(-8),
    currentPeriodStart: periodStartFor(d.period, today),
  }));
}

export async function createScorecard(
  ctx: Ctx,
  input: {
    name: string;
    unit: ScorecardUnit;
    target?: number | null;
    period: ScorecardPeriod;
  },
): Promise<ScorecardDTO> {
  assertRole(ctx, "admin");
  assertFeature(ctx, "scorecards", "Scorecards");

  const [{ n }] = await ctx.db
    .select({ n: count() })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.workspaceId, ctx.workspace.id),
        isNull(kpiDefinitions.archivedAt),
      ),
    );
  if (n >= MAX_ACTIVE) {
    throw new ValidationError(
      `Keep it to ${MAX_ACTIVE} scorecards, archive one that stopped mattering`,
    );
  }

  const [row] = await ctx.db
    .insert(kpiDefinitions)
    .values({
      workspaceId: ctx.workspace.id,
      name: input.name,
      unit: input.unit,
      target: input.target ?? null,
      period: input.period,
      createdBy: ctx.userId,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    unit: row.unit as ScorecardUnit,
    target: row.target,
    period: row.period,
    entries: [],
    currentPeriodStart: periodStartFor(row.period, todaySAST()),
  };
}

/** Archiving keeps every entry (never trap data), it just leaves the wall. */
export async function archiveScorecard(ctx: Ctx, cardId: string): Promise<void> {
  assertRole(ctx, "admin");
  const [row] = await ctx.db
    .update(kpiDefinitions)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(kpiDefinitions.id, cardId),
        eq(kpiDefinitions.workspaceId, ctx.workspace.id),
      ),
    )
    .returning({ id: kpiDefinitions.id });
  if (!row) throw new NotFoundError("Scorecard not found");
}

export async function upsertScorecardEntry(
  ctx: Ctx,
  cardId: string,
  input: { periodStart: string; value: number },
): Promise<{ periodStart: string; value: number }> {
  assertFeature(ctx, "scorecards", "Scorecards");

  const [def] = await ctx.db
    .select()
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.id, cardId),
        eq(kpiDefinitions.workspaceId, ctx.workspace.id),
        isNull(kpiDefinitions.archivedAt),
      ),
    );
  if (!def) throw new NotFoundError("Scorecard not found");

  assertAligned(def.period, input.periodStart);
  const current = periodStartFor(def.period, todaySAST());
  if (input.periodStart > current) {
    throw new ValidationError("That period hasn't started yet");
  }

  await ctx.db
    .insert(kpiEntries)
    .values({
      workspaceId: ctx.workspace.id,
      definitionId: def.id,
      periodStart: input.periodStart,
      value: input.value,
      source: "manual",
      enteredBy: ctx.userId,
    })
    .onConflictDoUpdate({
      target: [kpiEntries.definitionId, kpiEntries.periodStart],
      set: { value: input.value, enteredBy: ctx.userId, source: "manual" },
    });

  return { periodStart: input.periodStart, value: input.value };
}

/** This week's / this month's scorecard values, for the weekly narrative. */
export async function scorecardsForSummary(
  ctx: { db: Ctx["db"] },
  workspaceId: string,
  weekStartDay: string,
): Promise<{ name: string; unit: string; value: number | null; target: number | null }[]> {
  const defs = await ctx.db
    .select()
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.workspaceId, workspaceId),
        isNull(kpiDefinitions.archivedAt),
      ),
    )
    .orderBy(asc(kpiDefinitions.createdAt));
  if (defs.length === 0) return [];

  const rows = await ctx.db
    .select({
      definitionId: kpiEntries.definitionId,
      periodStart: kpiEntries.periodStart,
      value: kpiEntries.value,
    })
    .from(kpiEntries)
    .where(
      and(
        eq(kpiEntries.workspaceId, workspaceId),
        inArray(kpiEntries.definitionId, defs.map((d) => d.id)),
      ),
    )
    .orderBy(desc(kpiEntries.periodStart));

  return defs.map((d) => {
    const wanted = periodStartFor(d.period, weekStartDay);
    const hit = rows.find(
      (r) => r.definitionId === d.id && r.periodStart === wanted,
    );
    return {
      name: d.name,
      unit: d.unit,
      value: hit?.value ?? null,
      target: d.target,
    };
  });
}
