import { api, json } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { assertRole } from "@/server/dal/context";
import { currentSubscription, cancelSubscription } from "@/server/payfast/subscriptions";
import { workspaceUsage } from "@/server/dal/workspaces";

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

/** Owner-only cancel: drops to Free, nothing deleted, nothing locked. */
export const DELETE = api(async (_req, params) => {
  const ctx = await withWorkspace(params.ws);
  assertRole(ctx, "owner");
  const result = await cancelSubscription(ctx.db, ctx.workspace.id);
  return json({ ok: true, remote: result.remote });
});
