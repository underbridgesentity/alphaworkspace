/**
 * PayFast money-path tests. The signature semantics (field ORDER, PHP-style
 * urlencoding, passphrase append) are locked with hand-computed vectors;
 * ITN processing runs against PGlite through the real schema.
 */
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createWorkspace } from "@/server/dal/workspaces";
import {
  buildSignature,
  pfUrlEncode,
  verifyItnSignature,
} from "@/server/payfast/signature";
import { buildCheckout } from "@/server/payfast/checkout";
import { processItn } from "@/server/payfast/itn";
import {
  ADJUSTMENT_MPAYMENT_PREFIX,
  bandChangeQuotes,
  cancelSubscription,
  changeBand,
  createPendingSubscription,
  currentSubscription,
  prorataCatchUpCents,
  supersedeForComp,
  sweepExpiredGraceCancellations,
} from "@/server/payfast/subscriptions";
import { PLANS } from "@/lib/plans";
import { createTestDb, createTestUser } from "./helpers/db";

process.env.PAYFAST_MERCHANT_ID = "10000100";
process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
process.env.PAYFAST_PASSPHRASE = "jt7NOE43FZPn";
process.env.PAYFAST_SANDBOX = "true";
// In-place band changes are gated off in production until the PayFast API
// response contract is verified. The suite turns them on so the maths and the
// ordering stay covered; the gate itself is asserted in its own test below.
process.env.PAYFAST_PRORATION = "true";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

describe("pfUrlEncode (PHP urlencode semantics)", () => {
  it("encodes spaces as + and hex uppercase, leaves -_. bare", () => {
    expect(pfUrlEncode("John Smith & Co!")).toBe("John+Smith+%26+Co%21");
    expect(pfUrlEncode("a-b_c.d")).toBe("a-b_c.d");
    expect(pfUrlEncode("R499.00/mo (VAT incl)")).toBe(
      "R499.00%2Fmo+%28VAT+incl%29",
    );
    expect(pfUrlEncode("emoji✓")).toBe("emoji%E2%9C%93");
  });
});

describe("buildSignature", () => {
  it("matches a hand-computed vector, in field order with passphrase", () => {
    const fields: Array<[string, string]> = [
      ["merchant_id", "10000100"],
      ["merchant_key", "46f0cd694581a"],
      ["amount", "499.00"],
      ["item_name", "Alpha Workspace, Team plan (monthly)"],
    ];
    const manual =
      "merchant_id=10000100&merchant_key=46f0cd694581a&amount=499.00" +
      `&item_name=${pfUrlEncode("Alpha Workspace, Team plan (monthly)")}` +
      `&passphrase=${pfUrlEncode("jt7NOE43FZPn")}`;
    const expected = createHash("md5").update(manual).digest("hex");
    expect(buildSignature(fields, "jt7NOE43FZPn")).toBe(expected);
  });

  it("skips empty values and is order-sensitive", () => {
    const a = buildSignature(
      [
        ["merchant_id", "10000100"],
        ["name_first", ""],
        ["amount", "499.00"],
      ],
      "pass",
    );
    const b = buildSignature(
      [
        ["merchant_id", "10000100"],
        ["amount", "499.00"],
      ],
      "pass",
    );
    expect(a).toBe(b);

    const swapped = buildSignature(
      [
        ["amount", "499.00"],
        ["merchant_id", "10000100"],
      ],
      "pass",
    );
    expect(swapped).not.toBe(b);
  });
});

describe("buildCheckout", () => {
  it("prices from PLANS with the right frequency, signed last", () => {
    const base = {
      workspaceId: "ws-1",
      workspaceName: "Studio",
      mPaymentId: "aw-123",
      userEmail: "owner@studio.co.za",
    } as const;

    const monthly = buildCheckout({ ...base, plan: "team", billing: "monthly" });
    const f = Object.fromEntries(monthly.fields);
    expect(monthly.action).toBe("https://sandbox.payfast.co.za/eng/process");
    expect(f.amount).toBe("499.00");
    expect(f.recurring_amount).toBe("499.00");
    expect(f.frequency).toBe("3");
    expect(f.cycles).toBe("0");
    expect(f.subscription_type).toBe("1");
    expect(f.custom_str2).toBe("team");
    expect(monthly.fields.at(-1)?.[0]).toBe("signature");

    const annual = buildCheckout({ ...base, plan: "studio", billing: "annual" });
    const fa = Object.fromEntries(annual.fields);
    expect(fa.amount).toBe("9990.00");
    expect(fa.frequency).toBe("6");

    // Locked to config: a plan price change must flow through with no code change.
    expect(Number.parseFloat(f.amount)).toBe(PLANS.team.priceMonthlyZar);
  });

  it("verifies its own signature the way the ITN check would", () => {
    const { fields } = buildCheckout({
      workspaceId: "ws-1",
      workspaceName: "Studio",
      plan: "team",
      billing: "monthly",
      mPaymentId: "aw-123",
      userEmail: "owner@studio.co.za",
    });
    expect(verifyItnSignature(fields, process.env.PAYFAST_PASSPHRASE)).toBe(true);

    const tampered = fields.map(([k, v]): [string, string] =>
      k === "amount" ? [k, "1.00"] : [k, v],
    );
    expect(verifyItnSignature(tampered, process.env.PAYFAST_PASSPHRASE)).toBe(false);
  });
});

/* ------------------------------ ITN flow --------------------------------- */

let db: Db;
let wsId: string;
let mPaymentId: string;

function itnBody(overrides: Record<string, string> = {}): string {
  const params: Array<[string, string]> = [
    ["m_payment_id", overrides.m_payment_id ?? mPaymentId],
    ["pf_payment_id", "1089250"],
    ["payment_status", overrides.payment_status ?? "COMPLETE"],
    ["item_name", "Alpha Workspace, Team plan (monthly)"],
    ["amount_gross", overrides.amount_gross ?? "499.00"],
    ["amount_fee", "-11.48"],
    ["amount_net", "487.52"],
    ["custom_str1", wsId],
    ["custom_str2", "team"],
    ["custom_str3", "monthly"],
    ["token", overrides.token ?? "tok-abc-123"],
    ["merchant_id", overrides.merchant_id ?? "10000100"],
  ];
  const signature = buildSignature(params, process.env.PAYFAST_PASSPHRASE);
  params.push(["signature", overrides.signature ?? signature]);
  return params
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`)
    .join("&");
}

beforeAll(async () => {
  db = await createTestDb();
  const owner = await createTestUser(db, "owner@billing.co.za", "Owner");
  const ws = await createWorkspace(db, owner.id, { name: "Billing Co", seedStarter: false });
  wsId = ws.id;
  const pending = await createPendingSubscription(db, {
    workspaceId: wsId,
    plan: "team",
    billing: "monthly",
  });
  mPaymentId = pending.mPaymentId;
});

describe("processItn", () => {
  it("rejects a tampered signature before anything else", async () => {
    const result = await processItn(db, itnBody({ signature: "0".repeat(32) }), {
      skipPostback: true,
    });
    expect(result).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a foreign merchant id", async () => {
    const result = await processItn(db, itnBody({ merchant_id: "9999999" }), {
      skipPostback: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an amount that doesn't match the subscription", async () => {
    const result = await processItn(db, itnBody({ amount_gross: "1.00" }), {
      skipPostback: true,
    });
    expect(result).toEqual({ ok: false, reason: "amount-mismatch" });
    const sub = await currentSubscription(db, wsId);
    expect(sub?.status).toBe("pending");
  });

  it("ignores an unknown m_payment_id", async () => {
    const result = await processItn(db, itnBody({ m_payment_id: "aw-nope" }), {
      skipPostback: true,
    });
    expect(result).toEqual({ ok: false, reason: "unknown-m-payment-id" });
  });

  it("fails closed when the postback can't be validated", async () => {
    const result = await processItn(db, itnBody(), {
      fetchImpl: async () => new Response("INVALID"),
    });
    expect(result).toEqual({ ok: false, reason: "postback-invalid" });
  });

  it("activates on COMPLETE: subscription, workspace plan, snapshot, audit", async () => {
    const result = await processItn(db, itnBody(), {
      fetchImpl: async () => new Response("VALID"),
    });
    expect(result.ok).toBe(true);

    const sub = await currentSubscription(db, wsId);
    expect(sub?.status).toBe("active");

    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("team");
    expect(ws.entitlements).toEqual({
      maxMembers: PLANS.team.maxMembers,
      maxActiveProjects: PLANS.team.maxActiveProjects,
      voiceCapturesPerMonth: PLANS.team.voiceCapturesPerMonth,
      meetingMinutesPerMonth: PLANS.team.meetingMinutesPerMonth,
      features: [...PLANS.team.features],
    });

    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, wsId));
    const planChanges = events.filter((e) => e.type === "plan_changed");
    expect(planChanges).toHaveLength(1);
    expect(planChanges[0].data).toMatchObject({ from: "free", to: "team" });
  });

  it("is idempotent on a replayed COMPLETE", async () => {
    const result = await processItn(db, itnBody(), { skipPostback: true });
    expect(result.ok).toBe(true);
    const events = await db
      .select()
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, wsId));
    expect(events.filter((e) => e.type === "plan_changed")).toHaveLength(1);
  });

  it("marks past_due on a failed recurring charge", async () => {
    const result = await processItn(db, itnBody({ payment_status: "FAILED", amount_gross: "" }), {
      skipPostback: true,
    });
    expect(result.ok).toBe(true);
    const sub = await currentSubscription(db, wsId);
    expect(sub?.status).toBe("past_due");
  });

  it("drops to Free on CANCELLED, plan only, nothing deleted", async () => {
    const result = await processItn(db, itnBody({ payment_status: "CANCELLED" }), {
      skipPostback: true,
    });
    expect(result.ok).toBe(true);
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("free");
    expect(ws.entitlements).toBeNull();
    // The row itself records the cancellation…
    const [row] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, wsId));
    expect(row.status).toBe("cancelled");
    // …but "current subscription" is live billing state, so it's gone.
    expect(await currentSubscription(db, wsId)).toBeNull();
  });
});

describe("cancelSubscription (keep access until period end)", () => {
  it("schedules the drop for period end, keeping the paid plan meanwhile", async () => {
    // Activate Studio annual: currentPeriodEnd lands ~a year out.
    const pending = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "studio",
      billing: "annual",
    });
    mPaymentId = pending.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "9990.00", token: "tok-2" }), {
      skipPostback: true,
    });

    // PayFast API unreachable must NOT block the local cancel.
    const result = await cancelSubscription(db, wsId, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(result.remote).toBe(false);
    expect(result.immediate).toBe(false);
    expect(result.endsAt).toBeTruthy();

    // Grace: plan + entitlements HELD, the sub is still "current" (active with
    // a cancelledAt marker), and the billing surface can show "ends on".
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("studio");
    const cur = await currentSubscription(db, wsId);
    expect(cur?.status).toBe("active");
    expect(cur?.cancelledAt).toBeTruthy();
  });

  it("sweep before period end leaves the plan alone", async () => {
    const { downgraded } = await sweepExpiredGraceCancellations(db, {
      now: new Date(),
    });
    expect(downgraded).toBe(0);
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("studio");
  });

  it("sweep after period end drops the workspace to Free", async () => {
    const later = new Date(Date.now() + 400 * 86_400_000); // past the annual end
    const { downgraded } = await sweepExpiredGraceCancellations(db, {
      now: later,
    });
    expect(downgraded).toBe(1);
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("free");
    expect(ws.entitlements).toBeNull();
    // Now fully cancelled and out of "current".
    expect(await currentSubscription(db, wsId)).toBeNull();
    // Idempotent: a second sweep changes nothing.
    const again = await sweepExpiredGraceCancellations(db, { now: later });
    expect(again.downgraded).toBe(0);
  });

  it("cancels immediately when there is nothing paid-through to honour", async () => {
    // Activate, then force the period end into the past → immediate cancel.
    const pending = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "team",
      billing: "monthly",
    });
    mPaymentId = pending.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "499.00", token: "tok-3" }), {
      skipPostback: true,
    });
    await db
      .update(schema.subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - 86_400_000) })
      .where(eq(schema.subscriptions.mPaymentId, mPaymentId));

    const result = await cancelSubscription(db, wsId);
    expect(result.immediate).toBe(true);
    expect(result.endsAt).toBeNull();
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("free");
    expect(await currentSubscription(db, wsId)).toBeNull();
  });
});

describe("no double billing on a band change", () => {
  it("supersedes the old active subscription when a new one activates", async () => {
    // Start clean: activate Team.
    const team = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "team",
      billing: "monthly",
    });
    mPaymentId = team.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "499.00", token: "tok-team" }), {
      skipPostback: true,
    });
    let [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("team");

    // Owner clicks "Upgrade to Studio" while Team is live → new sub activates.
    const studio = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "studio",
      billing: "monthly",
    });
    mPaymentId = studio.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "999.00", token: "tok-studio" }), {
      skipPostback: true,
    });

    // Exactly ONE live subscription remains, the Studio one; Team is cancelled.
    const live = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.workspaceId, wsId),
          ne(schema.subscriptions.status, "cancelled"),
        ),
      );
    expect(live).toHaveLength(1);
    expect(live[0].plan).toBe("studio");
    [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("studio");
  });

  it("keeps the meeting_bots add-on (and base features) across a plan change", async () => {
    // Grant the add-on on top of an active Team snapshot.
    await db
      .update(schema.workspaces)
      .set({
        plan: "team",
        entitlements: {
          maxMembers: 10,
          maxActiveProjects: null,
          voiceCapturesPerMonth: 200,
          meetingMinutesPerMonth: 600,
          features: [...PLANS.team.features, "meeting_bots"],
        },
      })
      .where(eq(schema.workspaces.id, wsId));

    // Upgrade to Studio via a fresh COMPLETE.
    const studio = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "studio",
      billing: "monthly",
    });
    mPaymentId = studio.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "999.00", token: "tok-bots" }), {
      skipPostback: true,
    });

    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    const feats = ws.entitlements?.features ?? [];
    expect(feats).toContain("meeting_bots"); // add-on survived
    expect(feats).toContain("scorecards"); // Studio base features present
    expect(feats).toContain("weekly_narrative");
  });

  it("a COMPLETE for an already-cancelled subscription never resurrects it", async () => {
    const sub = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "team",
      billing: "monthly",
    });
    mPaymentId = sub.mPaymentId;
    // Mark it cancelled, workspace on free.
    await db
      .update(schema.subscriptions)
      .set({ status: "cancelled" })
      .where(eq(schema.subscriptions.mPaymentId, sub.mPaymentId));
    await db
      .update(schema.workspaces)
      .set({ plan: "free", entitlements: null })
      .where(eq(schema.workspaces.id, wsId));

    // A late/duplicate COMPLETE arrives for that cancelled sub.
    const result = await processItn(
      db,
      itnBody({ amount_gross: "499.00", token: "tok-late" }),
      { skipPostback: true },
    );
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.mPaymentId, sub.mPaymentId));
    expect(row.status).toBe("cancelled"); // still cancelled
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("free"); // not re-upgraded
  });
});

describe("supersedeForComp (operator comp clears grace, keeps live money)", () => {
  it("cancels pending + grace subs but leaves a genuinely-live one alone", async () => {
    const owner = await createTestUser(db, "comp@billing.co.za", "Comp Owner");
    const ws = await createWorkspace(db, owner.id, {
      name: "Comp Co",
      seedStarter: false,
    });
    const future = new Date(Date.now() + 30 * 86_400_000);

    // Genuinely-live sub (active, no cancelledAt): real money, must survive.
    const live = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "team",
      billing: "monthly",
    });
    await db
      .update(schema.subscriptions)
      .set({ status: "active", currentPeriodEnd: future })
      .where(eq(schema.subscriptions.mPaymentId, live.mPaymentId));

    // Grace sub (active + cancelledAt): token already stopped, must clear.
    const grace = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "studio",
      billing: "monthly",
    });
    await db
      .update(schema.subscriptions)
      .set({ status: "active", cancelledAt: new Date(), currentPeriodEnd: future })
      .where(eq(schema.subscriptions.mPaymentId, grace.mPaymentId));

    // Pending sub (never completed): must clear.
    const pend = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "team",
      billing: "monthly",
    });

    await supersedeForComp(db, ws.id);

    const rows = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, ws.id));
    const find = (m: string) => rows.find((r) => r.mPaymentId === m)!;
    expect(find(live.mPaymentId).status).toBe("active"); // real money untouched
    expect(find(live.mPaymentId).cancelledAt).toBeNull();
    expect(find(grace.mPaymentId).status).toBe("cancelled"); // grace cleared
    expect(find(pend.mPaymentId).status).toBe("cancelled"); // pending cleared

    // With the grace marker gone, the period-end sweep can never later drop
    // this comped workspace to Free through it.
    const graceRow = find(grace.mPaymentId);
    expect(graceRow.status).not.toBe("active");
  });
});

describe("cancel hardening (guardian findings)", () => {
  it("a past_due cancel drops immediately (its last charge failed), no grace", async () => {
    const owner = await createTestUser(db, "pastdue@billing.co.za", "PD");
    const ws = await createWorkspace(db, owner.id, {
      name: "PD Co",
      seedStarter: false,
    });
    const p = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "team",
      billing: "monthly",
    });
    await db
      .update(schema.subscriptions)
      .set({
        status: "past_due",
        payfastToken: "tok-pd",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000), // future!
      })
      .where(eq(schema.subscriptions.mPaymentId, p.mPaymentId));
    await db
      .update(schema.workspaces)
      .set({ plan: "team" })
      .where(eq(schema.workspaces.id, ws.id));

    const res = await cancelSubscription(db, ws.id, {
      fetchImpl: async () => new Response("", { status: 200 }),
    });
    expect(res.immediate).toBe(true); // NOT grace, despite a future period end
    expect(res.endsAt).toBeNull();
    const [w] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ws.id));
    expect(w.plan).toBe("free");
  });

  it("the sweep downgrades a stray non-active grace row after period end", async () => {
    const owner = await createTestUser(db, "stray@billing.co.za", "Stray");
    const ws = await createWorkspace(db, owner.id, {
      name: "Stray Co",
      seedStarter: false,
    });
    const p = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "studio",
      billing: "monthly",
    });
    // A hypothetical past_due grace row (defence in depth): cancelledAt set,
    // period end already elapsed. The sweep must still catch it.
    await db
      .update(schema.subscriptions)
      .set({
        status: "past_due",
        cancelledAt: new Date(),
        currentPeriodEnd: new Date(Date.now() - 86_400_000),
      })
      .where(eq(schema.subscriptions.mPaymentId, p.mPaymentId));
    await db
      .update(schema.workspaces)
      .set({ plan: "studio" })
      .where(eq(schema.workspaces.id, ws.id));

    const { downgraded } = await sweepExpiredGraceCancellations(db, {
      now: new Date(),
    });
    expect(downgraded).toBeGreaterThanOrEqual(1);
    const [w] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ws.id));
    expect(w.plan).toBe("free");
  });

  it("cancelling preserves a paid meeting_bots add-on on the Free downgrade", async () => {
    const owner = await createTestUser(db, "addon@billing.co.za", "Addon");
    const ws = await createWorkspace(db, owner.id, {
      name: "Addon Co",
      seedStarter: false,
    });
    const p = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "team",
      billing: "monthly",
    });
    await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        payfastToken: "tok-ad",
        currentPeriodEnd: new Date(Date.now() - 86_400_000), // past → immediate
      })
      .where(eq(schema.subscriptions.mPaymentId, p.mPaymentId));
    await db
      .update(schema.workspaces)
      .set({
        plan: "team",
        entitlements: {
          maxMembers: PLANS.team.maxMembers,
          maxActiveProjects: PLANS.team.maxActiveProjects,
          voiceCapturesPerMonth: PLANS.team.voiceCapturesPerMonth,
          meetingMinutesPerMonth: PLANS.team.meetingMinutesPerMonth,
          features: [...PLANS.team.features, "meeting_bots"],
        },
      })
      .where(eq(schema.workspaces.id, ws.id));

    await cancelSubscription(db, ws.id, {
      fetchImpl: async () => new Response("", { status: 200 }),
    });
    const [w] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ws.id));
    expect(w.plan).toBe("free");
    expect(w.entitlements?.features).toContain("meeting_bots"); // add-on kept
  });

  it("cancel stops the live token even when a newer abandoned checkout exists", async () => {
    const owner = await createTestUser(db, "shadow@billing.co.za", "Shadow");
    const ws = await createWorkspace(db, owner.id, {
      name: "Shadow Co",
      seedStarter: false,
    });
    const livePending = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "team",
      billing: "monthly",
    });
    await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        payfastToken: "tok-live",
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      })
      .where(eq(schema.subscriptions.mPaymentId, livePending.mPaymentId));
    await db
      .update(schema.workspaces)
      .set({ plan: "team" })
      .where(eq(schema.workspaces.id, ws.id));
    // A NEWER abandoned upgrade checkout (pending, no token) must not shadow it.
    const abandoned = await createPendingSubscription(db, {
      workspaceId: ws.id,
      plan: "studio",
      billing: "monthly",
    });

    const hit: string[] = [];
    const res = await cancelSubscription(db, ws.id, {
      fetchImpl: async (url) => {
        hit.push(String(url));
        return new Response("", { status: 200 });
      },
    });
    // The LIVE token was stopped at PayFast (not the pending/no-token row)…
    expect(hit.some((u) => u.includes("tok-live"))).toBe(true);
    // …and grace is based on the real active sub, so the plan is kept.
    expect(res.immediate).toBe(false);
    const [w] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, ws.id));
    expect(w.plan).toBe("team");
    // The abandoned checkout is cleared so it can't linger and re-charge.
    const rows = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, ws.id));
    expect(rows.find((r) => r.mPaymentId === abandoned.mPaymentId)!.status).toBe(
      "cancelled",
    );
  });
});

/* --------------------------- band changes -------------------------------- */

const DAY = 86_400_000;

/**
 * A workspace with exactly one live, tokened, mid-period subscription: the
 * only shape an in-place band change is allowed to touch.
 */
async function seedLive(opts: {
  email: string;
  name: string;
  plan: "team" | "studio";
  billing?: "monthly" | "annual";
  token?: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<{ wsId: string; mPaymentId: string }> {
  const owner = await createTestUser(db, opts.email, opts.name);
  const ws = await createWorkspace(db, owner.id, {
    name: opts.name,
    seedStarter: false,
  });
  const pending = await createPendingSubscription(db, {
    workspaceId: ws.id,
    plan: opts.plan,
    billing: opts.billing ?? "monthly",
  });
  await db
    .update(schema.subscriptions)
    .set({
      status: "active",
      payfastToken: opts.token ?? "tok-live",
      currentPeriodStart: opts.periodStart,
      currentPeriodEnd: opts.periodEnd,
    })
    .where(eq(schema.subscriptions.mPaymentId, pending.mPaymentId));
  await db
    .update(schema.workspaces)
    .set({ plan: opts.plan, entitlements: null })
    .where(eq(schema.workspaces.id, ws.id));
  return { wsId: ws.id, mPaymentId: pending.mPaymentId };
}

interface PfCall {
  url: string;
  method: string;
  params: URLSearchParams;
}

/** Records every PayFast API call; `fail` matches a path fragment to reject. */
function recorder(fail?: string) {
  const calls: PfCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      params: new URLSearchParams(String(init?.body ?? "")),
    });
    return new Response("", { status: fail && url.includes(fail) ? 500 : 200 });
  };
  return { calls, fetchImpl };
}

function planOf(wsId: string) {
  return db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, wsId))
    .then((r) => r[0].plan);
}

function subOf(mPaymentId: string) {
  return db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.mPaymentId, mPaymentId))
    .then((r) => r[0]);
}

/** A signed ITN, independent of the shared fixture above. */
function signedItn(fields: Record<string, string>): string {
  const params: Array<[string, string]> = [
    ["m_payment_id", fields.m_payment_id],
    ["pf_payment_id", "2000001"],
    ["payment_status", fields.payment_status ?? "COMPLETE"],
    ["item_name", "Alpha Workspace, band change"],
    ["amount_gross", fields.amount_gross ?? "499.00"],
    ["token", fields.token ?? "tok-live"],
    ["merchant_id", "10000100"],
  ];
  params.push([
    "signature",
    buildSignature(params, process.env.PAYFAST_PASSPHRASE),
  ]);
  return params
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`)
    .join("&");
}

describe("prorataCatchUpCents (rounds the customer's way, never over the delta)", () => {
  const base = {
    fromAmountCents: 49_900,
    toAmountCents: 99_900,
  };

  it("a same-day change pays the whole difference, and never more", () => {
    const start = new Date("2026-08-01T09:00:00Z");
    const end = new Date(start.getTime() + 31 * DAY);
    expect(
      prorataCatchUpCents({ ...base, periodStart: start, periodEnd: end, now: start }),
    ).toBe(50_000);

    // A clock skewed before the period start still cannot exceed the delta.
    expect(
      prorataCatchUpCents({
        ...base,
        periodStart: start,
        periodEnd: end,
        now: new Date(start.getTime() - 10 * DAY),
      }),
    ).toBe(50_000);
  });

  it("prices 12 of 31 days, rounding cents down", () => {
    const now = new Date("2026-08-20T09:00:00Z");
    const cents = prorataCatchUpCents({
      ...base,
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
      now,
    });
    // 50 000 × 12/31 = 19 354.83, floored.
    expect(cents).toBe(19_354);
  });

  it("charges nothing on the last day of a period", () => {
    const now = new Date("2026-08-31T09:00:00Z");
    expect(
      prorataCatchUpCents({
        ...base,
        periodStart: new Date(now.getTime() - 30.5 * DAY),
        periodEnd: new Date(now.getTime() + 12 * 3_600_000), // 12 hours left
        now,
      }),
    ).toBe(0);
  });

  it("charges nothing once the period has elapsed, or when moving down", () => {
    const start = new Date("2026-08-01T09:00:00Z");
    const end = new Date(start.getTime() + 31 * DAY);
    expect(
      prorataCatchUpCents({
        ...base,
        periodStart: start,
        periodEnd: end,
        now: new Date(end.getTime() + DAY),
      }),
    ).toBe(0);
    expect(
      prorataCatchUpCents({
        fromAmountCents: 99_900,
        toAmountCents: 49_900,
        periodStart: start,
        periodEnd: end,
        now: start,
      }),
    ).toBe(0);
  });

  it("scales to an annual period", () => {
    const now = new Date("2026-08-01T09:00:00Z");
    const cents = prorataCatchUpCents({
      fromAmountCents: 499_000,
      toAmountCents: 999_000,
      periodStart: new Date(now.getTime() - 265 * DAY),
      periodEnd: new Date(now.getTime() + 100 * DAY),
      now,
    });
    expect(cents).toBe(Math.floor((500_000 * 100) / 365)); // 136 986
  });
});

describe("changeBand: downgrade patches the mandate, keeps the paid band", () => {
  it("moves the recurring amount down and defers the band to the period end", async () => {
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 12 * DAY);
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "down@billing.co.za",
      name: "Down Co",
      plan: "studio",
      token: "tok-down",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd,
    });

    const { calls, fetchImpl } = recorder();
    const res = await changeBand(db, id, { plan: "team", billing: "monthly" }, {
      fetchImpl,
      now,
    });

    expect(res).toMatchObject({
      mode: "changed",
      plan: "team",
      direction: "downgrade",
      recurringCents: 49_900,
      catchUpCents: 0,
      catchUpCharged: false,
      effectiveAt: periodEnd.toISOString(),
    });

    // Exactly one PayFast call: the mandate update. No money moved today.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toContain("tok-down/update");
    expect(calls[0].params.get("amount")).toBe("49900"); // CENTS, not rand

    // The row is on Team so renewals price and audit correctly…
    const row = await subOf(m);
    expect(row.plan).toBe("team");
    expect(row.amountCents).toBe(49_900);
    // …but the workspace keeps the Studio it already paid for.
    expect(await planOf(id)).toBe("studio");
  });

  it("the next renewal ITN lands the deferred band without an amount mismatch", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "renew@billing.co.za",
      name: "Renew Co",
      plan: "studio",
      token: "tok-renew",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });
    await changeBand(db, id, { plan: "team", billing: "monthly" }, {
      fetchImpl: recorder().fetchImpl,
      now,
    });
    expect(await planOf(id)).toBe("studio");

    // PayFast now charges the patched R499. The ITN must accept it and move
    // the workspace across, not reject it as the wrong amount.
    const result = await processItn(
      db,
      signedItn({ m_payment_id: m, amount_gross: "499.00", token: "tok-renew" }),
      { skipPostback: true },
    );
    expect(result.ok).toBe(true);
    expect(await planOf(id)).toBe("team");
    expect(await subOf(m).then((r) => r.status)).toBe("active");
  });
});

describe("changeBand: upgrade patches up and charges the pro rata", () => {
  it("patches the mandate, moves the band now, then takes the catch-up", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "up@billing.co.za",
      name: "Up Co",
      plan: "team",
      token: "tok-up",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    const { calls, fetchImpl } = recorder();
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });

    expect(res).toMatchObject({
      mode: "changed",
      plan: "studio",
      direction: "upgrade",
      recurringCents: 99_900,
      catchUpCents: 19_354,
      catchUpCharged: true,
      effectiveAt: null,
    });

    // MONEY BEFORE ENTITLEMENTS: the catch-up is charged FIRST, and only a
    // successful charge is allowed to move the mandate and the band. The old
    // order (patch, move, then charge) handed out the higher band for free
    // whenever the catch-up failed, which is the expected production path.
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calls[0].url).toContain("tok-up/adhoc");
    expect(calls[0].params.get("amount")).toBe("19354");
    expect(calls[0].params.get("itn")).toBe("true");
    expect(calls[1].url).toContain("tok-up/update");
    expect(calls[1].params.get("amount")).toBe("99900");
    // Its own reference, so the ITN can never read it as a renewal.
    expect(calls[0].params.get("m_payment_id")).toMatch(
      new RegExp(`^${ADJUSTMENT_MPAYMENT_PREFIX}`),
    );
    expect(calls[0].params.get("m_payment_id")).not.toBe(m);

    expect(await planOf(id)).toBe("studio");
    const row = await subOf(m);
    expect(row.plan).toBe("studio");
    expect(row.amountCents).toBe(99_900);
  });

  it("a declined catch-up grants NOTHING and falls back to checkout", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "adhocfail@billing.co.za",
      name: "Adhoc Co",
      plan: "team",
      token: "tok-af",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    // The known unverified risk: adhoc may refuse a subscription_type=1 token.
    const { calls, fetchImpl } = recorder("adhoc");
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });

    // If the money does not move, nothing moves. Granting the band on a
    // declined catch-up was farmable: upgrade with a failing charge, then
    // downgrade, and keep the higher band to period end at the lower price,
    // every period. The owner is sent to a full checkout where they really pay.
    expect(res).toEqual({ mode: "checkout", reason: "catch-up-declined" });
    expect(calls).toHaveLength(1); // charged first, so the mandate was never touched
    expect(calls[0].url).toContain("adhoc");
    expect(await planOf(id)).toBe("team"); // NOT upgraded
    expect(await subOf(m).then((r) => r.amountCents)).toBe(49_900); // mandate untouched
  });

  it("cannot be farmed: a refused catch-up then a downgrade leaves no free band", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "farm@billing.co.za",
      name: "Farm Co",
      plan: "team",
      token: "tok-farm",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    // Step 1: upgrade whose catch-up is declined.
    await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl: recorder("adhoc").fetchImpl,
      now,
    });
    expect(await planOf(id)).toBe("team");

    // Step 2: immediately "downgrade" back. A downgrade deliberately leaves
    // the workspace on the band it paid for until period end, so if step 1 had
    // granted studio, this is where it would be locked in for free.
    await changeBand(db, id, { plan: "team", billing: "monthly" }, {
      fetchImpl: recorder().fetchImpl,
      now,
    });
    expect(await planOf(id)).toBe("team");
  });

  it("a refused mandate update changes nothing and hands back to checkout", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "patchfail@billing.co.za",
      name: "Patch Co",
      plan: "team",
      token: "tok-pf",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    const { calls, fetchImpl } = recorder("update");
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });

    // The catch-up is charged first now, so it lands, and then the mandate
    // refuses. The customer has PAID for this period's higher band, so
    // withholding it would be theft: grant it, keep amountCents on the real
    // mandate so renewals still validate, and flag it for reconciliation.
    expect(res).toMatchObject({
      mode: "changed",
      direction: "upgrade",
      catchUpCharged: true,
      recurringCents: 49_900, // the REAL mandate, not the target
    });
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(await planOf(id)).toBe("studio"); // they paid for it
    // amountCents tracks the live mandate, or every renewal ITN would fail.
    expect(await subOf(m).then((r) => r.amountCents)).toBe(49_900);
  });
});

describe("changeBand idempotency and fallbacks", () => {
  it("a retried upgrade charges nothing a second time", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "retry@billing.co.za",
      name: "Retry Co",
      plan: "team",
      token: "tok-retry",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    const first = recorder();
    await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl: first.fetchImpl,
      now,
    });
    expect(first.calls).toHaveLength(2);

    const second = recorder();
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl: second.fetchImpl,
      now,
    });
    expect(res).toEqual({ mode: "noop", plan: "studio" });
    expect(second.calls).toHaveLength(0); // nothing re-sent, nothing re-charged
  });

  it("moving back up during a scheduled downgrade costs nothing", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "undo@billing.co.za",
      name: "Undo Co",
      plan: "studio",
      token: "tok-undo",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });
    await changeBand(db, id, { plan: "team", billing: "monthly" }, {
      fetchImpl: recorder().fetchImpl,
      now,
    });

    // The row says Team, the workspace still says Studio because Studio is
    // paid for. Going back up must not re-bill that difference.
    const { calls, fetchImpl } = recorder();
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });
    expect(res).toMatchObject({ mode: "changed", catchUpCents: 0 });
    expect(calls.map((c) => c.method)).toEqual(["PATCH"]); // no adhoc at all
    expect(await planOf(id)).toBe("studio");
  });

  it("falls back to checkout without a token, and on a billing-cycle switch", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "notoken@billing.co.za",
      name: "NoToken Co",
      plan: "team",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    // Same mandate, different cycle: the run date would move under the maths.
    const cycle = await changeBand(db, id, { plan: "studio", billing: "annual" }, {
      fetchImpl: recorder().fetchImpl,
      now,
    });
    expect(cycle).toEqual({ mode: "checkout", reason: "billing-cycle-change" });

    await db
      .update(schema.subscriptions)
      .set({ payfastToken: null })
      .where(eq(schema.subscriptions.workspaceId, id));
    const { calls, fetchImpl } = recorder();
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });
    expect(res).toEqual({ mode: "checkout", reason: "no-token" });
    expect(calls).toHaveLength(0);
    expect(await planOf(id)).toBe("team");
  });

  it("a grace cancel is left alone: its token is already stopped", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "gracechange@billing.co.za",
      name: "Grace Co",
      plan: "team",
      token: "tok-grace",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });
    await db
      .update(schema.subscriptions)
      .set({ cancelledAt: now })
      .where(eq(schema.subscriptions.workspaceId, id));

    const { calls, fetchImpl } = recorder();
    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl,
      now,
    });
    expect(res).toEqual({ mode: "checkout", reason: "no-live-subscription" });
    expect(calls).toHaveLength(0);
  });
});

describe("band-change quotes and the catch-up ITN", () => {
  it("quotes what changeBand would actually charge", async () => {
    const now = new Date();
    const { wsId: id } = await seedLive({
      email: "quote@billing.co.za",
      name: "Quote Co",
      plan: "team",
      token: "tok-quote",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });

    const quotes = await bandChangeQuotes(db, id, { now });
    expect(quotes).toHaveLength(1); // only the band they're not on
    expect(quotes[0]).toMatchObject({
      plan: "studio",
      direction: "upgrade",
      inPlace: true,
      catchUpCents: 19_354,
      recurringCents: 99_900,
    });

    const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
      fetchImpl: recorder().fetchImpl,
      now,
    });
    expect(res).toMatchObject({ catchUpCents: quotes[0].catchUpCents });
  });

  it("a catch-up ITN is never read as an activation or a renewal", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "adjitn@billing.co.za",
      name: "AdjItn Co",
      plan: "studio",
      token: "tok-adj",
      periodStart: new Date(now.getTime() - 19 * DAY),
      periodEnd: new Date(now.getTime() + 12 * DAY),
    });
    const before = await subOf(m);

    const result = await processItn(
      db,
      signedItn({
        m_payment_id: `${ADJUSTMENT_MPAYMENT_PREFIX}${before.id}-abc`,
        amount_gross: "193.54",
        token: "tok-adj",
      }),
      { skipPostback: true },
    );
    expect(result).toEqual({ ok: true, reason: "proration-adjustment" });

    // Period untouched (no free extension), plan untouched, nothing logged.
    const after = await subOf(m);
    expect(after.currentPeriodEnd?.getTime()).toBe(
      before.currentPeriodEnd?.getTime(),
    );
    expect(after.amountCents).toBe(before.amountCents);
    expect(await planOf(id)).toBe("studio");

    // A DECLINED catch-up must not push the recurring subscription past due.
    const declined = await processItn(
      db,
      signedItn({
        m_payment_id: `${ADJUSTMENT_MPAYMENT_PREFIX}${before.id}-abc`,
        payment_status: "FAILED",
        amount_gross: "193.54",
      }),
      { skipPostback: true },
    );
    expect(declined.ok).toBe(true);
    expect(await subOf(m).then((r) => r.status)).toBe("active");
  });
});

describe("proration is gated off until PayFast's contract is verified", () => {
  it("falls back to the full checkout when the flag is not set", async () => {
    const now = new Date();
    const { wsId: id, mPaymentId: m } = await seedLive({
      email: "gated@billing.co.za",
      name: "Gated Co",
      plan: "team",
      token: "tok-gate",
      periodStart: new Date(now.getTime() - 10 * DAY),
      periodEnd: new Date(now.getTime() + 20 * DAY),
    });

    const prev = process.env.PAYFAST_PRORATION;
    process.env.PAYFAST_PRORATION = "false";
    try {
      const { calls, fetchImpl } = recorder();
      const res = await changeBand(db, id, { plan: "studio", billing: "monthly" }, {
        fetchImpl,
        now,
      });

      // No PayFast call at all, no local change: the owner goes through the
      // proven checkout where the money moves before anything is granted.
      expect(res).toEqual({ mode: "checkout", reason: "proration-disabled" });
      expect(calls).toHaveLength(0);
      expect(await planOf(id)).toBe("team");
      expect(await subOf(m).then((r) => r.amountCents)).toBe(49_900);

      // And the billing surface offers no in-place quotes either.
      expect(await bandChangeQuotes(db, id, { now })).toEqual([]);
    } finally {
      process.env.PAYFAST_PRORATION = prev;
    }
  });
});
