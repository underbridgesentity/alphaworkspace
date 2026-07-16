import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { assertRole } from "@/server/dal/context";
import { checkoutSchema } from "@/lib/validators";
import { buildCheckout } from "@/server/payfast/checkout";
import { createPendingSubscription } from "@/server/payfast/subscriptions";
import { requireUser } from "@/server/session";

/** Owner-only: creates a pending subscription and returns the PayFast form. */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  assertRole(ctx, "owner");
  const user = await requireUser();
  const input = await readJson(req, checkoutSchema);

  const pending = await createPendingSubscription(ctx.db, {
    workspaceId: ctx.workspace.id,
    plan: input.plan,
    billing: input.billing,
  });

  const { action, fields } = buildCheckout({
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    plan: input.plan,
    billing: input.billing,
    mPaymentId: pending.mPaymentId,
    userEmail: user.email,
    userFirstName: user.name?.split(/\s+/)[0],
  });

  return json({ action, fields });
});
