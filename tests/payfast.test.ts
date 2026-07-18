/**
 * PayFast money-path tests. The signature semantics (field ORDER, PHP-style
 * urlencoding, passphrase append) are locked with hand-computed vectors;
 * ITN processing runs against PGlite through the real schema.
 */
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
    const sub = await currentSubscription(db, wsId);
    expect(sub?.status).toBe("cancelled");
  });
});

describe("cancelSubscription", () => {
  it("cancels locally even when the PayFast API is unreachable", async () => {
    // Re-activate first.
    const pending = await createPendingSubscription(db, {
      workspaceId: wsId,
      plan: "studio",
      billing: "annual",
    });
    mPaymentId = pending.mPaymentId;
    await processItn(db, itnBody({ amount_gross: "9990.00", token: "tok-2" }), {
      skipPostback: true,
    });

    const result = await cancelSubscription(db, wsId, {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(result.remote).toBe(false);

    const sub = await currentSubscription(db, wsId);
    expect(sub?.status).toBe("cancelled");
    const [ws] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, wsId));
    expect(ws.plan).toBe("free");
  });
});
