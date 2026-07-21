/**
 * Subscription lifecycle helpers around PayFast's recurring billing.
 * NOTE: the subscriptions API signs ALPHABETICALLY (headers + body params
 * sorted by name, passphrase included as a param), unlike checkout/ITN
 * which sign in field order.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/server/db";
import { subscriptions, workspaces } from "@/server/db/schema";
import { logActivity } from "@/server/dal/activity";
import { checkoutAmountZar, payfastSandbox } from "./checkout";
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

export async function cancelSubscription(
  db: Db,
  workspaceId: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ remote: boolean }> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const remote = await cancelRemote(sub?.payfastToken ?? null, opts.fetchImpl);

  const now = new Date();
  if (sub && sub.status !== "cancelled") {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(
        inArray(
          subscriptions.id,
          [sub.id],
        ),
      );
  }

  const [ws] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (ws && ws.plan !== "free") {
    await db
      .update(workspaces)
      .set({ plan: "free", entitlements: null })
      .where(eq(workspaces.id, workspaceId));
    await logActivity(db, {
      workspaceId,
      type: "plan_changed",
      actorId: null,
      data: { from: ws.plan, to: "free", reason: "cancelled" },
    });
  }

  return { remote };
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
