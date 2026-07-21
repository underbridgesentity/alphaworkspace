/**
 * ITN (Instant Transaction Notification) processing, the webhook that moves
 * money state. Verification order is non-negotiable:
 *   1. signature   2. merchant id   3. server postback   4. amount
 * Only then do we touch the subscription. Always answer 200 upstream;
 * PayFast retries aggressively on anything else.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db";
import { subscriptions, workspaces } from "@/server/db/schema";
import { type PlanId } from "@/lib/plans";
import { logActivity } from "@/server/dal/activity";
import { verifyItnSignature } from "./signature";
import { payfastSandbox } from "./checkout";
import { snapshotForPlan } from "./entitlements";
import { supersedeOtherSubscriptions } from "./subscriptions";

export { entitlementsSnapshot } from "./entitlements";

export interface ItnResult {
  ok: boolean;
  reason?: string;
}

function validateUrl(): string {
  return payfastSandbox()
    ? "https://sandbox.payfast.co.za/eng/query/validate"
    : "https://www.payfast.co.za/eng/query/validate";
}

async function setWorkspacePlan(
  db: Db,
  workspaceId: string,
  from: PlanId,
  to: PlanId,
  extra: Record<string, unknown>,
) {
  // Carry any workspace-specific add-on forward; a band snapshot alone would
  // silently strip a feature the customer is paying for. (snapshotForPlan.)
  const [existing] = await db
    .select({ entitlements: workspaces.entitlements })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const snapshot = snapshotForPlan(to, existing?.entitlements);

  await db
    .update(workspaces)
    .set({ plan: to, entitlements: snapshot })
    .where(eq(workspaces.id, workspaceId));
  await logActivity(db, {
    workspaceId,
    type: "plan_changed",
    actorId: null,
    data: { from, to, ...extra },
  });
}

export async function processItn(
  db: Db,
  rawBody: string,
  opts: { skipPostback?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<ItnResult> {
  const params = new URLSearchParams(rawBody);
  const get = (k: string) => params.get(k) ?? "";

  // 1. Signature.
  if (!verifyItnSignature(params, process.env.PAYFAST_PASSPHRASE)) {
    return { ok: false, reason: "bad-signature" };
  }
  // 2. Merchant.
  if (get("merchant_id") !== (process.env.PAYFAST_MERCHANT_ID ?? "")) {
    return { ok: false, reason: "merchant-mismatch" };
  }
  // 3. Server-to-server confirmation with PayFast.
  if (!opts.skipPostback) {
    try {
      const doFetch = opts.fetchImpl ?? fetch;
      const body = [...params.entries()]
        .filter(([k]) => k !== "signature")
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      const res = await doFetch(validateUrl(), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await res.text();
      if (!text.trim().startsWith("VALID")) {
        return { ok: false, reason: "postback-invalid" };
      }
    } catch {
      return { ok: false, reason: "postback-unreachable" };
    }
  }

  // Locate our subscription.
  const mPaymentId = get("m_payment_id");
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.mPaymentId, mPaymentId));
  if (!sub) return { ok: false, reason: "unknown-m-payment-id" };

  const [ws] = await db
    .select({ id: workspaces.id, plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, sub.workspaceId));
  if (!ws) return { ok: false, reason: "workspace-gone" };

  const status = get("payment_status");
  const lastItn = Object.fromEntries(params.entries());
  const now = new Date();

  if (status === "COMPLETE") {
    // A COMPLETE for a subscription the user already cancelled — fully, or
    // scheduled-to-end (grace: still "active" but cancelledAt is set) — is a
    // stale or duplicated notification, NEVER a resurrection or extension.
    // Record it, change nothing (billing was already stopped at PayFast).
    if (sub.status === "cancelled" || sub.cancelledAt != null) {
      await db
        .update(subscriptions)
        .set({ lastItn, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      return { ok: true };
    }

    // 4. Amount, only for money-moving notifications.
    const gross = Number.parseFloat(get("amount_gross"));
    const expected = sub.amountCents / 100;
    if (!Number.isFinite(gross) || Math.abs(gross - expected) > 0.01) {
      return { ok: false, reason: "amount-mismatch" };
    }

    const alreadyActive = sub.status === "active";
    const periodMs =
      sub.billing === "annual" ? 365 * 86_400_000 : 31 * 86_400_000;

    await db
      .update(subscriptions)
      .set({
        status: "active",
        payfastToken: get("token") || sub.payfastToken,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + periodMs),
        lastItn,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));

    // Activation (not renewal) flips the workspace plan + snapshot.
    if (!alreadyActive || ws.plan !== sub.plan) {
      // A brand-new subscription supersedes any prior live one, so a band
      // change (Team → Studio) never leaves two recurring charges running.
      if (!alreadyActive) {
        await supersedeOtherSubscriptions(db, ws.id, sub.id);
      }
      await setWorkspacePlan(db, ws.id, ws.plan, sub.plan, {
        billing: sub.billing,
        mPaymentId,
      });
    }
    return { ok: true };
  }

  if (status === "CANCELLED") {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, lastItn, updatedAt: now })
      .where(eq(subscriptions.id, sub.id));
    if (ws.plan !== "free") {
      await setWorkspacePlan(db, ws.id, ws.plan, "free", {
        reason: "payfast_cancelled",
      });
    }
    return { ok: true };
  }

  // Failed recurring charge or anything else we don't recognise → past due,
  // never a lockout (the plan stays until cancellation).
  await db
    .update(subscriptions)
    .set({ status: "past_due", lastItn, updatedAt: now })
    .where(eq(subscriptions.id, sub.id));
  return { ok: true };
}
