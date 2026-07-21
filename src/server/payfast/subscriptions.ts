/**
 * Subscription lifecycle helpers around PayFast's recurring billing.
 * NOTE: the subscriptions API signs ALPHABETICALLY (headers + body params
 * sorted by name, passphrase included as a param), unlike checkout/ITN
 * which sign in field order.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, lte, ne, or } from "drizzle-orm";
import type { Db } from "@/server/db";
import { subscriptions, workspaces } from "@/server/db/schema";
import { logActivity } from "@/server/dal/activity";
import { checkoutAmountZar, payfastSandbox } from "./checkout";
import { snapshotForPlan } from "./entitlements";
import { pfUrlEncode } from "./signature";

export async function createPendingSubscription(
  db: Db,
  input: {
    workspaceId: string;
    plan: "team" | "studio";
    billing: "monthly" | "annual";
  },
): Promise<{ id: string; mPaymentId: string; amountCents: number }> {
  const amountCents = Math.round(checkoutAmountZar(input.plan, input.billing) * 100);
  const mPaymentId = `aw-${crypto.randomUUID()}`;
  const [row] = await db
    .insert(subscriptions)
    .values({
      workspaceId: input.workspaceId,
      plan: input.plan,
      billing: input.billing,
      status: "pending",
      mPaymentId,
      amountCents,
    })
    .returning({ id: subscriptions.id });
  return { id: row.id, mPaymentId, amountCents };
}

function apiSignature(params: Record<string, string>, passphrase?: string): string {
  const all: Record<string, string> = {
    ...params,
    ...(passphrase ? { passphrase } : {}),
  };
  const str = Object.keys(all)
    .sort()
    .map((k) => `${k}=${pfUrlEncode(all[k])}`)
    .join("&");
  return createHash("md5").update(str).digest("hex");
}

/**
 * Cancel the workspace's current subscription. Tries the PayFast API when a
 * recurring token exists; regardless of remote success, local state drops to
 * Free (never a lockout, existing work stays).
 */
/** Best-effort PayFast-side cancel of ONE subscription by its token. */
async function cancelRemote(
  payfastToken: string | null,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  if (
    !payfastToken ||
    !process.env.PAYFAST_MERCHANT_ID ||
    !process.env.PAYFAST_PASSPHRASE
  ) {
    return false;
  }
  try {
    const timestamp = new Date().toISOString().slice(0, 19);
    const headers = {
      "merchant-id": process.env.PAYFAST_MERCHANT_ID,
      version: "v1",
      timestamp,
    };
    const signature = apiSignature(headers, process.env.PAYFAST_PASSPHRASE);
    const doFetch = fetchImpl ?? fetch;
    const url = `https://api.payfast.co.za/subscriptions/${payfastToken}/cancel${payfastSandbox() ? "?testing=true" : ""}`;
    const res = await doFetch(url, { method: "PUT", headers: { ...headers, signature } });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stop every live subscription for a workspace EXCEPT `keepId`. Used when a
 * new subscription activates so a band change never leaves two recurring
 * charges running in parallel (the double-billing trap). Best-effort remote
 * cancel + always local; returns how many were superseded.
 */
export async function supersedeOtherSubscriptions(
  db: Db,
  workspaceId: string,
  keepId: string,
  fetchImpl?: typeof fetch,
): Promise<number> {
  const others = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        ne(subscriptions.id, keepId),
        ne(subscriptions.status, "cancelled"),
      ),
    );
  const now = new Date();
  for (const s of others) {
    await cancelRemote(s.payfastToken, fetchImpl);
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(subscriptions.id, s.id));
  }
  return others.length;
}

/**
 * Drop a workspace to Free, preserving any paid add-on (meeting_bots) exactly
 * like every other downgrade path (snapshotForPlan). No-op + returns false if
 * it was already Free. Shared by the immediate cancel and the period-end sweep.
 */
async function downgradeToFree(
  db: Db,
  workspaceId: string,
  now: Date,
  reason: string,
  note?: string,
): Promise<boolean> {
  const [ws] = await db
    .select({ plan: workspaces.plan, entitlements: workspaces.entitlements })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws || ws.plan === "free") return false;
  await db
    .update(workspaces)
    .set({ plan: "free", entitlements: snapshotForPlan("free", ws.entitlements) })
    .where(eq(workspaces.id, workspaceId));
  await logActivity(db, {
    workspaceId,
    type: "plan_changed",
    actorId: null,
    data: { from: ws.plan, to: "free", reason, ...(note ? { note } : {}) },
  });
  return true;
}

/**
 * When an operator comps/changes a workspace's plan, clear the subscriptions
 * their decision overrides: checkouts that never completed ("pending") AND any
 * grace cancel already in flight (still a billable status but cancelledAt set,
 * its token already stopped). Genuinely-live subscriptions (no cancelledAt) are
 * left ALONE — that's real money still being charged. Leaving a grace marker
 * behind would let the period-end sweep silently drop the comp to Free later,
 * so it must be cleared here.
 */
export async function supersedeForComp(
  db: Db,
  workspaceId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        ne(subscriptions.status, "cancelled"),
        or(
          eq(subscriptions.status, "pending"),
          isNotNull(subscriptions.cancelledAt), // any grace variant
        ),
      ),
    );
}

/**
 * Owner-initiated cancel. EVERY live PayFast token for the workspace is stopped
 * now (no surprise charge — including an abandoned upgrade checkout's second
 * token), and the paid plan they've already paid for is kept until the current
 * period ends, THEN it drops to Free (the morning sweep does that). Grace is
 * earned ONLY by a genuinely active sub with time already paid for; a past_due
 * sub (its last charge failed) or anything with nothing paid-through drops
 * immediately. Nothing is ever deleted, nothing locks.
 */
export async function cancelSubscription(
  db: Db,
  workspaceId: string,
  opts: { fetchImpl?: typeof fetch; reason?: string; now?: Date } = {},
): Promise<{ remote: boolean; endsAt: string | null; immediate: boolean }> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        ne(subscriptions.status, "cancelled"),
      ),
    )
    .orderBy(desc(subscriptions.createdAt));

  // Stop EVERY live recurring token so nothing keeps charging after a cancel;
  // an abandoned upgrade checkout can leave a second live token behind.
  const tokened = rows.filter((r) => r.payfastToken);
  let remote = tokened.length > 0;
  for (const r of tokened) {
    if (!(await cancelRemote(r.payfastToken, opts.fetchImpl))) remote = false;
  }

  // Grace is earned only by a genuinely active sub with time already paid for.
  const live = rows.find((r) => r.status === "active") ?? null;
  const graceEnd =
    live &&
    live.currentPeriodEnd &&
    live.currentPeriodEnd.getTime() > now.getTime()
      ? live.currentPeriodEnd
      : null;

  if (live && graceEnd) {
    // Everything else non-cancelled (abandoned pendings, stray rows) ends now;
    // the live row goes into grace: status stays "active", cancelledAt is the
    // marker, so plan + entitlements hold until the period end.
    for (const r of rows) {
      if (r.id === live.id) continue;
      await db
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(subscriptions.id, r.id));
    }
    await db
      .update(subscriptions)
      .set({ cancelledAt: now, updatedAt: now })
      .where(eq(subscriptions.id, live.id));
    await logActivity(db, {
      workspaceId,
      type: "plan_changed",
      actorId: null,
      data: {
        from: live.plan,
        to: "free",
        reason: "cancel_scheduled",
        endsAt: graceEnd.toISOString(),
        ...(opts.reason ? { note: opts.reason } : {}),
      },
    });
    return { remote, endsAt: graceEnd.toISOString(), immediate: false };
  }

  // Nothing paid-through to honour: end every non-cancelled row now, drop Free.
  for (const r of rows) {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(subscriptions.id, r.id));
  }
  await downgradeToFree(db, workspaceId, now, "cancelled", opts.reason);
  return { remote, endsAt: null, immediate: true };
}

/**
 * Drop workspaces whose grace period (a scheduled cancel) has now elapsed to
 * Free. Matches any NON-cancelled row carrying a cancelledAt marker with an
 * elapsed period end — a normal active/pending/past_due row has cancelledAt
 * null, superseded/comped rows are already "cancelled", so this uniquely hits
 * grace rows (and would still catch a past_due grace should one ever arise).
 * Idempotent: after the flip the row is "cancelled" and the plan is Free, so it
 * won't re-fire. Runs daily from the morning cron.
 */
export async function sweepExpiredGraceCancellations(
  db: Db,
  opts: { now?: Date } = {},
): Promise<{ downgraded: number }> {
  const now = opts.now ?? new Date();
  const due = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        ne(subscriptions.status, "cancelled"),
        isNotNull(subscriptions.cancelledAt),
        isNotNull(subscriptions.currentPeriodEnd),
        lte(subscriptions.currentPeriodEnd, now),
      ),
    );

  let downgraded = 0;
  for (const sub of due) {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    if (await downgradeToFree(db, sub.workspaceId, now, "cancel_period_end")) {
      downgraded++;
    }
  }
  return { downgraded };
}

export async function currentSubscription(db: Db, workspaceId: string) {
  const [sub] = await db
    .select({
      id: subscriptions.id,
      plan: subscriptions.plan,
      billing: subscriptions.billing,
      status: subscriptions.status,
      amountCents: subscriptions.amountCents,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelledAt: subscriptions.cancelledAt,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        // Cancelled rows are history, not state; showing one next to a live
        // (or comped) plan reads as a scary "pending payment" forever.
        ne(subscriptions.status, "cancelled"),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return sub ?? null;
}
