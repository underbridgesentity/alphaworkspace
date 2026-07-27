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
import { PLANS, type PlanId } from "@/lib/plans";
import { logActivity } from "@/server/dal/activity";
import { checkoutAmountZar, payfastSandbox } from "./checkout";
import { snapshotForPlan } from "./entitlements";
import { pfUrlEncode } from "./signature";

type SubscriptionRow = typeof subscriptions.$inferSelect;

/** The two paid bands, in the order the billing surface offers them. */
const PAID_BANDS = ["team", "studio"] as const;
type PaidBand = (typeof PAID_BANDS)[number];

/**
 * Pro-rata catch-up charges are separate payments with their own ITN, so they
 * carry their own m_payment_id under this prefix. The ITN handler keys off it
 * to make sure a catch-up is never read as an activation or a renewal.
 */
export const ADJUSTMENT_MPAYMENT_PREFIX = "aw-adj-";

/**
 * The reference for a pro-rata catch-up. Deterministic per subscription, band
 * and period, so retrying a half-completed band change reuses the SAME
 * reference rather than minting a new one. PayFast treats m_payment_id as
 * unique per merchant, so a duplicate is rejected and the customer cannot pay
 * the same catch-up twice.
 */
function adjustmentReference(
  subscriptionId: string,
  plan: PaidBand,
  periodStart: Date,
): string {
  const period = periodStart.toISOString().slice(0, 10);
  return `${ADJUSTMENT_MPAYMENT_PREFIX}${subscriptionId}-${plan}-${period}`;
}

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
 * One call against the PayFast subscriptions API. Never throws: every caller
 * here is best-effort by design, and a thrown network error must not be able
 * to leave local money state half-written. Returns whether PayFast accepted it.
 *
 * Body params are signed together with the headers, alphabetically (see the
 * file header). Missing credentials return false, which is what keeps dev and
 * test runs on the checkout fallback instead of pretending a call succeeded.
 */
async function payfastApi(
  path: string,
  method: "PUT" | "PATCH" | "POST",
  body: Record<string, string> | null,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  if (!process.env.PAYFAST_MERCHANT_ID || !process.env.PAYFAST_PASSPHRASE) {
    return false;
  }
  try {
    const timestamp = new Date().toISOString().slice(0, 19);
    const headers = {
      "merchant-id": process.env.PAYFAST_MERCHANT_ID,
      version: "v1",
      timestamp,
    };
    const signature = apiSignature(
      { ...headers, ...(body ?? {}) },
      process.env.PAYFAST_PASSPHRASE,
    );
    const doFetch = fetchImpl ?? fetch;
    const url = `https://api.payfast.co.za/subscriptions/${path}${payfastSandbox() ? "?testing=true" : ""}`;
    const res = await doFetch(url, {
      method,
      headers: body
        ? {
            ...headers,
            signature,
            "content-type": "application/x-www-form-urlencoded",
          }
        : { ...headers, signature },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Best-effort PayFast-side cancel of ONE subscription by its token. */
async function cancelRemote(
  payfastToken: string | null,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  if (!payfastToken) return false;
  return payfastApi(`${payfastToken}/cancel`, "PUT", null, fetchImpl);
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
 * Move a workspace onto a band, preserving any paid add-on (meeting_bots)
 * exactly like every other plan path (snapshotForPlan), and writing the one
 * plan_changed event the audit trail depends on. Returns false (and touches
 * nothing) when the workspace is already there, which is what makes every
 * caller safe to retry.
 */
async function movePlan(
  db: Db,
  workspaceId: string,
  to: PlanId,
  extra: Record<string, unknown>,
  actorId: string | null = null,
): Promise<boolean> {
  const [ws] = await db
    .select({ plan: workspaces.plan, entitlements: workspaces.entitlements })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!ws || ws.plan === to) return false;
  await db
    .update(workspaces)
    .set({ plan: to, entitlements: snapshotForPlan(to, ws.entitlements) })
    .where(eq(workspaces.id, workspaceId));
  await logActivity(db, {
    workspaceId,
    type: "plan_changed",
    actorId,
    data: { from: ws.plan, to, ...extra },
  });
  return true;
}

/** Drop to Free. Shared by the immediate cancel and the period-end sweep. */
async function downgradeToFree(
  db: Db,
  workspaceId: string,
  reason: string,
  note?: string,
): Promise<boolean> {
  return movePlan(db, workspaceId, "free", {
    reason,
    ...(note ? { note } : {}),
  });
}

/**
 * When an operator comps/changes a workspace's plan, clear the subscriptions
 * their decision overrides: checkouts that never completed ("pending") AND any
 * grace cancel already in flight (still a billable status but cancelledAt set,
 * its token already stopped). Genuinely-live subscriptions (no cancelledAt) are
 * left ALONE, that's real money still being charged. Leaving a grace marker
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
 * now (no surprise charge, including an abandoned upgrade checkout's second
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
  await downgradeToFree(db, workspaceId, "cancelled", opts.reason);
  return { remote, endsAt: null, immediate: true };
}

/**
 * Drop workspaces whose grace period (a scheduled cancel) has now elapsed to
 * Free. Matches any NON-cancelled row carrying a cancelledAt marker with an
 * elapsed period end. A normal active/pending/past_due row has cancelledAt
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
    if (await downgradeToFree(db, sub.workspaceId, "cancel_period_end")) {
      downgraded++;
    }
  }
  return { downgraded };
}

/* ----------------------------- band changes ------------------------------ */

/**
 * The pro-rata catch-up for moving UP a band mid-period, in cents: the price
 * difference for the days the customer has not yet used.
 *
 * Every rounding step goes the customer's way. Days remaining round DOWN, the
 * period they are measured against rounds UP, and the cents round DOWN. The
 * result is capped at a full period's difference, so a clock skew or a bad
 * period can never charge more than a straight band swap would have. A change
 * on the last day of a period therefore costs nothing, which is correct: they
 * get the higher band free for a few hours and pay the new rate from the next
 * run date.
 */
export function prorataCatchUpCents(input: {
  fromAmountCents: number;
  toAmountCents: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): number {
  const delta = input.toAmountCents - input.fromAmountCents;
  if (delta <= 0) return 0;

  const dayMs = 86_400_000;
  const fullMs = input.periodEnd.getTime() - input.periodStart.getTime();
  if (fullMs <= 0) return 0;

  const remainingMs = Math.min(
    input.periodEnd.getTime() - input.now.getTime(),
    fullMs,
  );
  if (remainingMs <= 0) return 0;

  const remainingDays = Math.floor(remainingMs / dayMs);
  const totalDays = Math.ceil(fullMs / dayMs);
  if (remainingDays <= 0 || totalDays <= 0) return 0;

  const raw = Math.floor((delta * remainingDays) / totalDays);
  return Math.max(0, Math.min(raw, delta));
}

interface Changeable {
  sub: SubscriptionRow;
  token: string;
  periodStart: Date;
  periodEnd: Date;
  /**
   * What this period has actually been paid at, in cents. Normally the
   * subscription's own amount, but a scheduled downgrade leaves the row on the
   * smaller band while the workspace keeps the bigger one it already paid for.
   * Pro-rating off the smaller number would bill the same difference twice, so
   * the band they are actually running sets the floor.
   */
  paidCents: number;
}

/**
 * The one live mandate a band change may be applied to in place: exactly one
 * active subscription, not already winding down, holding a PayFast token, on
 * the same billing cycle, with a paid period still open. Anything else falls
 * back to a full checkout, which is blunter but always correct. Deliberately
 * strict: with two active rows we cannot tell which token PayFast is charging.
 */
async function findChangeable(
  db: Db,
  workspaceId: string,
  /** null when the caller has no target cycle yet and just wants the mandate. */
  billing: "monthly" | "annual" | null,
  now: Date,
): Promise<{ ok: true; live: Changeable } | { ok: false; reason: string }> {
  // OFF BY DEFAULT, deliberately. In-place band changes hang on two PayFast
  // API calls whose success we can only read from `res.ok`, and PayFast signals
  // business failures in the response BODY, commonly under HTTP 200. Until
  // that contract is confirmed against the PayFast sandbox, a declined
  // catch-up could read as paid and hand out the higher band for free.
  //
  // With the flag unset every band change falls through to the full checkout,
  // which is the proven path that has always run here: the customer really
  // pays, and nothing is granted before the money lands. Flip
  // PAYFAST_PRORATION=true only once the API responses have been verified and
  // the adjustment ITN is being reconciled (see the guardian findings).
  if (process.env.PAYFAST_PRORATION !== "true") {
    return { ok: false, reason: "proration-disabled" };
  }

  const active = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.status, "active"),
      ),
    )
    .orderBy(desc(subscriptions.createdAt));

  // A grace cancel keeps status "active" with cancelledAt set; its token is
  // already stopped at PayFast, so there is nothing left to patch.
  const live = active.filter((r) => r.cancelledAt == null);
  if (live.length === 0) return { ok: false, reason: "no-live-subscription" };
  if (live.length > 1) return { ok: false, reason: "ambiguous-subscription" };

  const sub = live[0];
  if (!sub.payfastToken) return { ok: false, reason: "no-token" };
  // Changing frequency mid-mandate would move the run date under the period
  // the pro-rata maths is measured against. Send those through checkout.
  if (billing && sub.billing !== billing) {
    return { ok: false, reason: "billing-cycle-change" };
  }
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
    return { ok: false, reason: "no-period" };
  }
  if (sub.currentPeriodEnd.getTime() <= now.getTime()) {
    return { ok: false, reason: "period-elapsed" };
  }

  const [ws] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const cycle = sub.billing === "annual" ? "annual" : "monthly";
  const runningCents =
    ws && ws.plan !== "free"
      ? Math.round(checkoutAmountZar(ws.plan, cycle) * 100)
      : 0;

  return {
    ok: true,
    live: {
      sub,
      token: sub.payfastToken,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      paidCents: Math.max(sub.amountCents, runningCents),
    },
  };
}

export interface BandChangeQuote {
  plan: PaidBand;
  billing: "monthly" | "annual";
  direction: "upgrade" | "downgrade";
  /** True when we can patch the live mandate; false means a full checkout. */
  inPlace: boolean;
  /** Charged now, cents. Always 0 for a downgrade and for a checkout. */
  catchUpCents: number;
  /** What the recurring charge becomes from the next run date, cents. */
  recurringCents: number;
  /** When a downgrade's smaller band actually starts. */
  effectiveAt: string | null;
}

/**
 * What each other paid band would cost right now, for the billing surface to
 * state before the owner commits. Computed from the same helpers the real
 * change uses, so the number shown is the number charged.
 */
export async function bandChangeQuotes(
  db: Db,
  workspaceId: string,
  opts: { now?: Date } = {},
): Promise<BandChangeQuote[]> {
  const now = opts.now ?? new Date();
  const found = await findChangeable(db, workspaceId, null, now);
  if (!found.ok) return [];

  const { sub, periodStart, periodEnd, paidCents } = found.live;
  const billing = sub.billing === "annual" ? "annual" : "monthly";

  return PAID_BANDS.filter((plan) => plan !== sub.plan).map((plan) => {
    const recurringCents = Math.round(checkoutAmountZar(plan, billing) * 100);
    const upgrade = recurringCents > sub.amountCents;
    return {
      plan,
      billing,
      direction: upgrade ? "upgrade" : "downgrade",
      inPlace: true,
      catchUpCents: upgrade
        ? prorataCatchUpCents({
            fromAmountCents: paidCents,
            toAmountCents: recurringCents,
            periodStart,
            periodEnd,
            now,
          })
        : 0,
      recurringCents,
      effectiveAt: upgrade ? null : periodEnd.toISOString(),
    };
  });
}

export type BandChangeOutcome =
  /** Nothing we can patch, the caller must run the full checkout instead. */
  | { mode: "checkout"; reason: string }
  /** Already on the target band at the target price: a retry, charge nothing. */
  | { mode: "noop"; plan: PaidBand }
  | {
      mode: "changed";
      plan: PaidBand;
      direction: "upgrade" | "downgrade";
      recurringCents: number;
      catchUpCents: number;
      /**
       * True whenever a catch-up was owed and taken. A declined catch-up never
       * reaches "changed" (the caller gets mode:"checkout" instead), so this is
       * false only when nothing was owed, or when the charge landed but the
       * mandate did not and an operator must reconcile.
       */
      catchUpCharged: boolean;
      effectiveAt: string | null;
    };

/**
 * Change band on the live PayFast mandate instead of selling a whole new
 * period. Two shapes, both anchored on the period the customer has already
 * paid for:
 *
 *  - Downgrade: patch the recurring amount down. They keep the bigger band
 *    until the period they paid for ends, then the renewal ITN (which now
 *    sees a subscription row on the smaller plan) moves the workspace across.
 *    No refund of the difference, and the UI says so.
 *  - Upgrade: patch the recurring amount up for future cycles, move the
 *    workspace now, and charge a pro-rata catch-up for the days left.
 *
 * Order is deliberate and always resolves doubt toward not charging. The
 * mandate is patched first, because a failure there means nothing has moved
 * anywhere and checkout is still a clean exit. Local state is committed next,
 * which is what makes a retried request a no-op. Only then do we attempt the
 * catch-up, so a crash or a PayFast refusal loses the catch-up rather than
 * risking a second one.
 */
export async function changeBand(
  db: Db,
  workspaceId: string,
  target: { plan: PaidBand; billing: "monthly" | "annual" },
  opts: { fetchImpl?: typeof fetch; now?: Date; actorId?: string | null } = {},
): Promise<BandChangeOutcome> {
  const now = opts.now ?? new Date();
  const recurringCents = Math.round(
    checkoutAmountZar(target.plan, target.billing) * 100,
  );

  const found = await findChangeable(db, workspaceId, target.billing, now);
  if (!found.ok) return { mode: "checkout", reason: found.reason };
  const { sub, token, periodStart, periodEnd, paidCents } = found.live;

  // The retry guard. A request that already landed left the row on the target
  // band at the target price, so a second one charges nothing. The workspace
  // plan is deliberately NOT reconciled here: after a downgrade it lags the
  // subscription until the paid period ends, and forcing it would take away
  // the band they paid for.
  if (sub.plan === target.plan && sub.amountCents === recurringCents) {
    return { mode: "noop", plan: target.plan };
  }

  const direction = recurringCents > sub.amountCents ? "upgrade" : "downgrade";

  // ORDER MATTERS, and it is the whole safety argument of this function:
  // MONEY MOVES BEFORE ENTITLEMENTS DO.
  //
  // The catch-up used to run last, after the workspace had already been moved
  // up. Because PayFast may only accept /adhoc against a tokenisation token
  // (checkout issues subscription_type=1, see checkout.ts) the catch-up is
  // expected to fail in production, so that ordering handed out the higher
  // band for free on the DEFAULT path. Worse, it was farmable: upgrade with a
  // failing catch-up, then immediately downgrade, and the workspace kept the
  // higher band to period end while paying the lower price, every period.
  //
  // So: charge first. If the charge does not land, nothing at all changes and
  // the caller falls back to a full checkout, where the customer really pays.
  let catchUpCents = 0;
  let catchUpCharged = false;
  if (direction === "upgrade") {
    catchUpCents = prorataCatchUpCents({
      fromAmountCents: paidCents,
      toAmountCents: recurringCents,
      periodStart,
      periodEnd,
      now,
    });
    if (catchUpCents > 0) {
      catchUpCharged = await payfastApi(
        `${token}/adhoc`,
        "POST",
        {
          amount: String(catchUpCents),
          item_name: `Alpha Workspace, ${PLANS[target.plan].name} upgrade (pro rata)`,
          // Deterministic per (subscription, band, period), NOT per attempt.
          // A retry after a half-failure therefore reuses the same reference,
          // and PayFast rejects a duplicate m_payment_id, so the customer
          // cannot be charged the same catch-up twice. Defence in depth, not
          // a guarantee: the real retry guard is the noop check above.
          m_payment_id: adjustmentReference(sub.id, target.plan, periodStart),
          itn: "true",
        },
        opts.fetchImpl,
      );
      if (!catchUpCharged) {
        console.warn(
          `[payfast] pro-rata catch-up declined for subscription ${sub.id}, ${catchUpCents} cents; band change refused, falling back to checkout`,
        );
        return { mode: "checkout", reason: "catch-up-declined" };
      }
    }
  }

  // The mandate. PayFast amounts are integer CENTS here, unlike checkout's
  // rand-with-decimals; getting that wrong is a hundredfold charge.
  const patched = await payfastApi(
    `${token}/update`,
    "PATCH",
    { amount: String(recurringCents) },
    opts.fetchImpl,
  );

  if (!patched) {
    if (!catchUpCharged) return { mode: "checkout", reason: "update-failed" };
    // Paid the catch-up, but the recurring amount did not move. The customer
    // has already paid for this period's higher band, so withholding it would
    // be theft; grant it, and leave amountCents on the REAL mandate value so
    // the next renewal ITN still passes its amount check. The consequence is a
    // renewal at the old price, which is a revenue leak an operator must
    // reconcile, so it is logged loudly rather than swallowed.
    console.error(
      `[payfast] RECONCILE: subscription ${sub.id} charged ${catchUpCents} cents for ${target.plan} but the mandate is still ${sub.amountCents}`,
    );
    await db
      .update(subscriptions)
      .set({ plan: target.plan, updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    await movePlan(
      db,
      workspaceId,
      target.plan,
      {
        reason: "band_upgraded",
        billing: target.billing,
        mandateOutOfSync: true,
        paidCatchUpCents: catchUpCents,
      },
      opts.actorId ?? null,
    );
    return {
      mode: "changed",
      plan: target.plan,
      direction,
      recurringCents: sub.amountCents,
      catchUpCents,
      catchUpCharged,
      effectiveAt: null,
    };
  }

  // Local state. amountCents MUST track the mandate or every future renewal
  // ITN fails its amount check and PayFast retries.
  await db
    .update(subscriptions)
    .set({ plan: target.plan, amountCents: recurringCents, updatedAt: now })
    .where(eq(subscriptions.id, sub.id));

  // A downgrade leaves the workspace on the band they paid for; the renewal
  // ITN sees plan drift and moves it across at the period end.
  if (direction === "upgrade") {
    await movePlan(
      db,
      workspaceId,
      target.plan,
      { reason: "band_upgraded", billing: target.billing },
      opts.actorId ?? null,
    );
  }

  if (direction === "downgrade") {
    await logActivity(db, {
      workspaceId,
      type: "plan_changed",
      actorId: opts.actorId ?? null,
      data: {
        from: sub.plan,
        to: target.plan,
        reason: "band_downgrade_scheduled",
        effectiveAt: periodEnd.toISOString(),
      },
    });
  }

  return {
    mode: "changed",
    plan: target.plan,
    direction,
    recurringCents,
    catchUpCents,
    catchUpCharged,
    effectiveAt: direction === "downgrade" ? periodEnd.toISOString() : null,
  };
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
