import "server-only";

/**
 * Operator (platform admin) layer. Deliberately separate from the tenant DAL:
 * operators manage the BUSINESS (workspaces, plans, MRR, usage) and never read
 * workspace content. Access = users.is_operator OR an email in
 * OPERATOR_EMAILS (bootstrap for the very first operator).
 */
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  activityEvents,
  memberships,
  subscriptions,
  users,
  voiceCaptures,
  workspaces,
} from "@/server/db/schema";
import { PLANS, type PlanId } from "@/lib/plans";
import { entitlementsSnapshot } from "@/server/payfast/itn";
import { ForbiddenError } from "@/server/dal/errors";

function bootstrapEmails(): string[] {
  return (process.env.OPERATOR_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isOperator(user: {
  id: string;
  email: string;
}): Promise<boolean> {
  if (bootstrapEmails().includes(user.email.toLowerCase())) return true;
  const [row] = await db
    .select({ isOperator: users.isOperator })
    .from(users)
    .where(eq(users.id, user.id));
  return row?.isOperator ?? false;
}

export async function requireOperator(user: {
  id: string;
  email: string;
}): Promise<void> {
  if (!(await isOperator(user))) throw new ForbiddenError("Operators only");
}

/** MRR from active subscriptions (annual normalised to monthly), plus counts. */
export async function platformOverview() {
  const [wsCount, memberCount, activeSubs] = await Promise.all([
    db.select({ n: count() }).from(workspaces),
    db.select({ n: count() }).from(memberships),
    db
      .select({
        plan: subscriptions.plan,
        billing: subscriptions.billing,
        amountCents: subscriptions.amountCents,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active")),
  ]);

  let mrrCents = 0;
  const byPlan: Record<string, number> = { team: 0, studio: 0 };
  for (const s of activeSubs) {
    const monthly = s.billing === "annual" ? s.amountCents / 12 : s.amountCents;
    mrrCents += monthly;
    byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
  }

  return {
    workspaces: wsCount[0]?.n ?? 0,
    members: memberCount[0]?.n ?? 0,
    paidWorkspaces: activeSubs.length,
    mrrZar: Math.round(mrrCents / 100),
    arrZar: Math.round((mrrCents / 100) * 12),
    byPlan,
  };
}

export async function listWorkspacesAdmin() {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      entitlements: workspaces.entitlements,
      createdAt: workspaces.createdAt,
      ownerEmail: users.email,
      members: sql<number>`(select count(*) from ${memberships} m where m.workspace_id = ${workspaces.id})`,
      captures: sql<number>`(select count(*) from ${voiceCaptures} v where v.workspace_id = ${workspaces.id} and v.created_at >= ${monthStart.toISOString()})`,
      lastActivity: sql<string | null>`(select max(created_at) from ${activityEvents} a where a.workspace_id = ${workspaces.id})`,
    })
    .from(workspaces)
    .leftJoin(users, eq(workspaces.createdBy, users.id))
    .orderBy(desc(workspaces.createdAt))
    .limit(200);

  return rows.map(({ entitlements, ...r }) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    members: Number(r.members),
    captures: Number(r.captures),
    botsEnabled: Boolean(entitlements?.features?.includes("meeting_bots")),
  }));
}

/** Comp/change a workspace's plan without going through PayFast. */
export async function setWorkspacePlanAdmin(
  workspaceId: string,
  plan: PlanId,
  actorId: string,
): Promise<void> {
  const [ws] = await db
    .select({ plan: workspaces.plan, entitlements: workspaces.entitlements })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) throw new ForbiddenError("Workspace not found");

  // Preserve the meeting-bots add-on across a comp/downgrade (a band snapshot
  // would strip it; re-enabling silently is a surprise).
  const keptAddons = (ws.entitlements?.features ?? []).filter(
    (f) => f === "meeting_bots",
  );
  const withAddons = () => {
    const base = entitlementsSnapshot(plan);
    return {
      ...base,
      features: [...base.features.filter((f) => f !== "meeting_bots"), ...keptAddons],
    };
  };
  const snapshot =
    plan === "free" ? (keptAddons.length ? withAddons() : null) : withAddons();

  await db
    .update(workspaces)
    .set({ plan, entitlements: snapshot })
    .where(eq(workspaces.id, workspaceId));

  // A comp supersedes any checkout that never completed; otherwise the
  // billing page shows "waiting for PayFast" forever next to a live plan.
  // Active PayFast subscriptions are deliberately left alone (real money).
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.status, "pending"),
      ),
    );

  await db.insert(activityEvents).values({
    workspaceId,
    type: "plan_changed",
    actorId,
    data: { from: ws.plan, to: plan, reason: "operator_comp" },
  });
}

/**
 * Toggle the meeting-bots add-on for one workspace. It lives ONLY in the
 * entitlements snapshot (no band includes it, it has per-minute vendor
 * cost); the snapshot is seeded from the plan config when absent. NOTE:
 * a later plan change through comp or PayFast rewrites the snapshot, so
 * re-enable after changing a band.
 */
export async function setMeetingBotsAdmin(
  workspaceId: string,
  enabled: boolean,
  actorId: string,
): Promise<void> {
  const [ws] = await db
    .select({ plan: workspaces.plan, entitlements: workspaces.entitlements })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws) throw new ForbiddenError("Workspace not found");

  const base = ws.entitlements ?? entitlementsSnapshot(ws.plan);
  const features = new Set(base.features ?? []);
  if (enabled) features.add("meeting_bots");
  else features.delete("meeting_bots");

  await db
    .update(workspaces)
    .set({ entitlements: { ...base, features: [...features] } })
    .where(eq(workspaces.id, workspaceId));

  await db.insert(activityEvents).values({
    workspaceId,
    type: "plan_changed",
    actorId,
    data: { addon: "meeting_bots", enabled, reason: "operator_toggle" },
  });
}

export async function recentSignups(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(gte(workspaces.createdAt, since));
  return row?.n ?? 0;
}

export { PLANS };
