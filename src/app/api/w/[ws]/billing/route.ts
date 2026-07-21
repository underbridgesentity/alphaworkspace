import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { assertRole } from "@/server/dal/context";
import { currentSubscription, cancelSubscription } from "@/server/payfast/subscriptions";
import { workspaceUsage } from "@/server/dal/workspaces";
import { cancelSubscriptionSchema } from "@/lib/validators";

export const GET = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  const [subscription, usage] = await Promise.all([
    currentSubscription(ctx.db, ctx.workspace.id),
    workspaceUsage(ctx),
  ]);
  return json({
    plan: ctx.workspace.plan,
    subscription,
    usage,
    sandbox: process.env.PAYFAST_SANDBOX !== "false",
  });
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
