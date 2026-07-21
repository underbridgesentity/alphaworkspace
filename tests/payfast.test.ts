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
  cancelSubscription,
  createPendingSubscription,
  currentSubscription,
  supersedeForComp,
  sweepExpiredGraceCancellations,
} from "@/server/payfast/subscriptions";
import { PLANS } from "@/lib/plans";
import { createTestDb, createTestUser } from "./helpers/db";

process.env.PAYFAST_MERCHANT_ID = "10000100";
process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
process.env.PAYFAST_PASSPHRASE = "jt7NOE43FZPn";
process.env.PAYFAST_SANDBOX = "true";
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
      ["item_name", "Alpha Workspace — Team plan (monthly)"],
    ];
    const manual =
      "merchant_id=10000100&merchant_key=46f0cd694581a&amount=499.00" +
      `&item_name=${pfUrlEncode("Alpha Workspace — Team plan (monthly)")}` +
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
    ["item_name", "Alpha Workspace — Team plan (monthly)"],
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

  it("drops to Free on CANCELLED — plan only, nothing deleted", async () => {
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
  it("a past_due cancel drops immediately (its last charge failed) — no grace", async () => {
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
