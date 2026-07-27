import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { assertRole } from "@/server/dal/context";
import {
  bandChangeQuotes,
  cancelSubscription,
  changeBand,
  currentSubscription,
} from "@/server/payfast/subscriptions";
import { workspaceUsage } from "@/server/dal/workspaces";
import { cancelSubscriptionSchema, checkoutSchema } from "@/lib/validators";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { LimitError } from "@/server/dal/errors";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  const [subscription, usage, bandChanges] = await Promise.all([
    currentSubscription(ctx.db, ctx.workspace.id),
    workspaceUsage(ctx),
    // Quoted server-side so the price the billing page states is the price
    // changeBand would actually charge, computed by the same helpers.
    bandChangeQuotes(ctx.db, ctx.workspace.id),
  ]);
  return json({
    plan: ctx.workspace.plan,
    subscription,
    usage,
    bandChanges,
    sandbox: process.env.PAYFAST_SANDBOX !== "false",
  });
});

/**
 * Owner-only band change on the live mandate: a downgrade patches the
 * recurring amount down from the next run date, an upgrade patches it up and
 * takes a pro-rata catch-up for the days left. Returns mode "checkout" when
 * there is nothing to patch, and the client falls back to a full checkout.
 */
export const PATCH = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  assertRole(ctx, "owner");
  // The only route in the app that can initiate an outbound charge. Until the
  // local adjustment record lands (see the guardian findings), this is what
  // blunts a double-click or two tabs racing two catch-up charges.
  if (!checkRateLimit(`band-change:${ctx.workspace.id}`, 3, 60_000)) {
    throw new LimitError("feature", "Too many billing changes at once, give it a minute");
  }
  const target = await readJson(req, checkoutSchema);
  const outcome = await changeBand(ctx.db, ctx.workspace.id, target, {
    actorId: ctx.userId,
  });
  return json(outcome);
});

/**
 * Owner-only cancel. Keeps the paid plan until the current period ends, THEN
 * drops to Free (unless there's nothing paid-through, which ends now). Nothing
 * deleted, nothing locked. An optional reason is captured for retention.
 */
export const DELETE = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  assertRole(ctx, "owner");
  const { reason } = await readJson(req, cancelSubscriptionSchema);
  const result = await cancelSubscription(ctx.db, ctx.workspace.id, {
    reason: reason ?? undefined,
  });
  return json({
    ok: true,
    remote: result.remote,
    endsAt: result.endsAt,
    immediate: result.immediate,
  });
});
