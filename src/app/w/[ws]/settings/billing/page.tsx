"use client";

/**
 * Billing: flat rand bands via PayFast. The checkout is a plain form POST
 * to PayFast, card details never touch Alpha. Cancelling drops to Free;
 * nothing is deleted, nothing locks.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { PLANS, formatZar, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface BillingData {
  plan: PlanId;
  subscription: {
    plan: PlanId;
    billing: string;
    status: "pending" | "active" | "past_due" | "cancelled";
    amountCents: number;
    currentPeriodEnd: string | null;
  } | null;
  usage: {
    members: number;
    activeProjects: number;
    voiceCapturesThisMonth: number;
  };
  sandbox: boolean;
}

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "text-ok" },
  pending: { label: "Waiting for PayFast confirmation", tone: "text-warn" },
  past_due: { label: "Payment past due, we'll retry", tone: "text-warn" },
  cancelled: { label: "Cancelled", tone: "text-faint" },
};

export default function BillingSettingsPage() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // A plan carried from the pricing page: "Start with Team" lands here so the
  // final checkout step is one obvious click, not a hunt through the bands.
  const searchParams = useSearchParams();
  const wantedRaw = searchParams.get("plan");
  const wantedPlan: "team" | "studio" | null =
    wantedRaw === "team" || wantedRaw === "studio" ? wantedRaw : null;

  const { data } = useQuery({
    queryKey: ["ws", workspace.slug, "billing"],
    queryFn: () => apiGet<BillingData>(`/api/w/${workspace.slug}/billing`),
  });

  const isOwner = workspace.role === "owner";
  const currentPlan = data?.plan ?? workspace.plan;

  const checkout = async (plan: "team" | "studio") => {
    setBusy(plan);
    try {
      const res = await apiMutate<{ action: string; fields: [string, string][] }>(
        `/api/w/${workspace.slug}/billing/checkout`,
        { method: "POST", body: { plan, billing: annual ? "annual" : "monthly" } },
      );
      if ("queued" in res && res.queued) {
        toast("You're offline, billing needs a connection", { variant: "error" });
        return;
      }
      // Hand off to PayFast with a plain form post.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = res.action;
      for (const [name, value] of res.fields) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Checkout failed", { variant: "error" });
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const res = await apiMutate<{ remote: boolean }>(
        `/api/w/${workspace.slug}/billing`,
        { method: "DELETE" },
      );
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
      // If PayFast couldn't confirm the stop, say so plainly, otherwise the
      // customer thinks they're done and a charge still lands.
      if ("remote" in res && res.remote === false) {
        toast(
          "You're on Free here, but we couldn't confirm the stop with PayFast. Check your PayFast account or contact us so no further charge lands.",
          { variant: "error" },
        );
        return;
      }
      toast("Subscription cancelled, you're on Free, nothing was deleted", {
        variant: "success",
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Cancel failed", { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {data?.sandbox && (
        <p className="rounded-control bg-warn/10 px-3 py-2 text-xs text-warn">
          PayFast sandbox mode, no real money moves.
        </p>
      )}

      {/* Checkout hand-off from the pricing page: one obvious next step. */}
      {wantedPlan && isOwner && currentPlan !== wantedPlan && (
        <section className="rounded-card border border-accent/40 bg-accent-soft p-4">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-accent" />
            <h2 className="flex-1 text-sm font-semibold">
              Start with {PLANS[wantedPlan].name}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatZar(
              annual
                ? PLANS[wantedPlan].priceAnnualZar
                : PLANS[wantedPlan].priceMonthlyZar,
            )}
            /{annual ? "year" : "month"}, VAT inclusive. You finish on PayFast,
            nothing is charged until you confirm there.
          </p>
          <Button
            className="mt-3"
            loading={busy === wantedPlan}
            onClick={() => void checkout(wantedPlan)}
          >
            Continue to PayFast
            <ArrowRight className="size-4" />
          </Button>
        </section>
      )}

      {/* Current state */}
      <section className="rounded-card bg-surface p-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className="size-4 text-accent" />
          <h2 className="flex-1 text-sm font-semibold">
            {PLANS[currentPlan].name} plan
          </h2>
          {data?.subscription && (
            <span
              className={cn(
                "text-xs font-medium",
                STATUS_COPY[data.subscription.status]?.tone,
              )}
            >
              {STATUS_COPY[data.subscription.status]?.label}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{PLANS[currentPlan].tagline}</p>
        {data && (
          <p className="mt-2 text-xs text-faint">
            {data.usage.members}/{PLANS[currentPlan].maxMembers} people ·{" "}
            {data.usage.activeProjects}
            {PLANS[currentPlan].maxActiveProjects !== null
              ? `/${PLANS[currentPlan].maxActiveProjects}`
              : ""}{" "}
            active projects · {data.usage.voiceCapturesThisMonth}/
            {PLANS[currentPlan].voiceCapturesPerMonth} voice captures this month
          </p>
        )}
        {/* Past due: tell the owner what to do and let them retry or stop. */}
        {data?.subscription?.status === "past_due" && isOwner && (
          <div className="mt-3 rounded-control bg-warn/10 p-3">
            <p className="text-xs text-warn">
              PayFast couldn&apos;t take the last payment. Retry to keep{" "}
              {PLANS[currentPlan].name}, or cancel to drop to Free. Nothing is
              locked in the meantime.
            </p>
            <div className="mt-2 flex gap-2">
              {currentPlan !== "free" && (
                <Button
                  size="sm"
                  loading={busy === currentPlan}
                  onClick={() => void checkout(currentPlan as "team" | "studio")}
                >
                  Retry payment
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                loading={busy === "cancel"}
                onClick={() => void cancel()}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {data?.subscription?.status === "active" && isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-danger"
            loading={busy === "cancel"}
            onClick={() => void cancel()}
          >
            Cancel subscription
          </Button>
        )}
      </section>

      {/* Band picker */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Bands</h2>
          <div className="flex items-center rounded-full bg-raised p-0.5 text-xs">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "press rounded-full px-3 py-1",
                !annual && "bg-overlay font-medium",
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "press rounded-full px-3 py-1",
                annual && "bg-overlay font-medium",
              )}
            >
              Annual <span className="text-accent">−2 months</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(Object.values(PLANS)).map((plan) => {
            const price = annual ? plan.priceAnnualZar : plan.priceMonthlyZar;
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-card bg-surface p-4",
                  isCurrent && "ring-1 ring-accent/50",
                  !isCurrent && plan.id === wantedPlan && "ring-2 ring-accent",
                )}
              >
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-xl font-semibold tracking-tight tabular">
                  {price === 0 ? "R0" : formatZar(price)}
                  <span className="text-xs font-normal text-faint">
                    /{annual ? "year" : "month"}
                  </span>
                </p>
                <ul className="mt-2 flex-1 space-y-1 text-xs text-muted">
                  <li>Up to {plan.maxMembers} people</li>
                  <li>
                    {plan.maxActiveProjects === null
                      ? "Unlimited projects"
                      : `${plan.maxActiveProjects} active projects`}
                  </li>
                  <li>{plan.voiceCapturesPerMonth} voice captures/month</li>
                  <li>{plan.meetingMinutesPerMonth} meeting minutes/month</li>
                  <li>Weekly narrative</li>
                  {plan.features.includes("morning_brief") && <li>Morning brief</li>}
                  {plan.features.includes("scorecards") && (
                    <li>Scorecards, time & client reports (as they ship)</li>
                  )}
                </ul>
                {plan.id !== "free" &&
                  (isCurrent ? (
                    <p className="mt-3 text-center text-xs font-medium text-faint">
                      Your current band
                    </p>
                  ) : isOwner ? (
                    <Button
                      size="sm"
                      className="mt-3"
                      variant={plan.id === "team" ? "primary" : "quiet"}
                      loading={busy === plan.id}
                      onClick={() => void checkout(plan.id as "team" | "studio")}
                    >
                      Upgrade to {plan.name}
                    </Button>
                  ) : (
                    <p className="mt-3 text-center text-xs text-faint">
                      Only the owner can change billing
                    </p>
                  ))}
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
          <ShieldCheck className="size-3.5" />
          VAT inclusive · billed in rand via PayFast · card details never touch
          Alpha · cancel anytime, your work stays.
        </p>
      </section>
    </div>
  );
}
