"use client";

/**
 * The billing page as the store shell sees it: the current plan stated as a
 * fact, nothing more. No prices, no band cards, no checkout, no cancel, no
 * upgrade language and no link out; store review (Apple 3.1.3(f), Play
 * Billing) reads the DOM, and the server page never renders the real billing
 * component for a shell request, so none of that markup exists here to hide.
 */
import { BadgeCheck } from "lucide-react";
import { useWorkspace } from "@/lib/client/workspace";
import { PLANS } from "@/lib/plans";

export function ShellPlanFacts() {
  const { workspace, usage } = useWorkspace();
  const plan = PLANS[workspace.plan];
  const limits = usage.limits;

  return (
    <section className="rounded-card bg-surface p-4">
      <div className="flex items-center gap-2">
        <BadgeCheck className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">{plan.name} plan</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        This workspace is on the {plan.name} plan.
      </p>
      <p className="mt-2 text-xs text-faint">
        {/* limits, not PLANS: a comped or operator-overridden workspace has
            its real caps in the entitlements snapshot. */}
        {usage.members}/{limits.maxMembers} people · {usage.activeProjects}
        {limits.maxActiveProjects !== null
          ? `/${limits.maxActiveProjects}`
          : ""}{" "}
        active projects · {usage.voiceCapturesThisMonth}/
        {limits.voiceCapturesPerMonth} voice captures this month
      </p>
    </section>
  );
}
