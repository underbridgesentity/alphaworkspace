/**
 * The one place that turns a plan into an entitlements snapshot, and the one
 * place that decides how add-ons (features that live outside the bands, e.g.
 * meeting_bots) survive a plan write. EVERY path that changes a workspace's
 * plan — ITN activation, operator comp, cancel, the period-end sweep — goes
 * through `snapshotForPlan`, so an add-on the customer pays for is never
 * silently stripped on a downgrade. Leaf module (imports only plan config), so
 * both itn.ts and subscriptions.ts can use it without an import cycle.
 */
import { PLANS, type PlanId } from "@/lib/plans";
import type { EntitlementsSnapshot } from "@/server/db/schema";

/** Add-on features that live outside any band and must survive a plan change. */
const ADDON_FEATURES = ["meeting_bots"] as const;

export function entitlementsSnapshot(plan: PlanId): EntitlementsSnapshot {
  const p = PLANS[plan];
  return {
    maxMembers: p.maxMembers,
    maxActiveProjects: p.maxActiveProjects,
    voiceCapturesPerMonth: p.voiceCapturesPerMonth,
    meetingMinutesPerMonth: p.meetingMinutesPerMonth,
    features: [...p.features],
  };
}

/**
 * Snapshot for `plan`, carrying any workspace add-on in `current` forward.
 * Free returns null UNLESS an add-on must be preserved (then a free snapshot
 * that includes the add-on). This is what makes a downgrade keep meeting_bots.
 */
export function snapshotForPlan(
  plan: PlanId,
  current: EntitlementsSnapshot | null | undefined,
): EntitlementsSnapshot | null {
  const keptAddons = (current?.features ?? []).filter((f) =>
    (ADDON_FEATURES as readonly string[]).includes(f),
  );
  if (plan === "free" && keptAddons.length === 0) return null;
  const base = entitlementsSnapshot(plan);
  return {
    ...base,
    features: [
      ...base.features.filter(
        (f) => !(ADDON_FEATURES as readonly string[]).includes(f),
      ),
      ...keptAddons,
    ],
  };
}
