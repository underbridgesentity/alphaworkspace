"use client";

/**
 * Billing: flat rand bands via PayFast. The checkout is a plain form POST
 * to PayFast, card details never touch Alpha. Cancelling keeps the plan until
 * the paid period ends, then drops to Free; nothing is deleted, nothing locks.
 *
 * Band changes ride the live mandate where they can (upgrade now for a
 * pro-rata catch-up, downgrade at the next run date) and fall back to a full
 * checkout otherwise. Every rand quoted here comes from the server so the
 * number on the confirm step is the number charged.
 */
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, Clock, ShieldCheck } from "lucide-react";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { PLANS, formatZar, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

interface BandChangeQuote {
  plan: "team" | "studio";
  billing: "monthly" | "annual";
  direction: "upgrade" | "downgrade";
  inPlace: boolean;
  catchUpCents: number;
  recurringCents: number;
  effectiveAt: string | null;
}

interface BandChangeOutcome {
  mode: "checkout" | "noop" | "changed";
  plan?: "team" | "studio";
  direction?: "upgrade" | "downgrade";
  catchUpCents?: number;
  catchUpCharged?: boolean;
  effectiveAt?: string | null;
}

interface BillingData {
  plan: PlanId;
  subscription: {
    plan: PlanId;
    billing: string;
    status: "pending" | "active" | "past_due" | "cancelled";
    amountCents: number;
    currentPeriodEnd: string | null;
    cancelledAt: string | null;
  } | null;
  usage: {
    members: number;
    activeProjects: number;
    voiceCapturesThisMonth: number;
  };
  /** Empty when no live mandate can be patched; then every switch is a checkout. */
  bandChanges: BandChangeQuote[];
  sandbox: boolean;
}

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  active: { label: "Active", tone: "text-ok" },
  pending: { label: "Waiting for PayFast confirmation", tone: "text-warn" },
  past_due: { label: "Payment past due, we'll retry", tone: "text-warn" },
  cancelled: { label: "Cancelled", tone: "text-faint" },
};

const CANCEL_REASONS = [
  "Too expensive",
  "Missing a feature I need",
  "Not using it right now",
  "Just trying it out",
  "Something else",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  });
}

/** Pro-rata amounts land on odd cents, so unlike band prices they show them. */
function fmtCents(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function BillingSettingsPage() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<BandChangeQuote | null>(null);

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
  const sub = data?.subscription ?? null;
  // Grace: cancelled but still inside the period they've already paid for.
  const grace = sub?.status === "active" && !!sub.cancelledAt;
  const graceEnds = grace ? fmtDate(sub?.currentPeriodEnd ?? null) : "";
  // A downgrade already patched onto the mandate: the row is on the smaller
  // band while the workspace keeps the one it paid for until the period ends.
  const scheduledBand =
    sub && sub.status === "active" && !grace && sub.plan !== currentPlan
      ? sub.plan
      : null;

  const checkout = async (plan: "team" | "studio") => {
    setBusy(plan);
    try {
      const res = await apiMutate<{ action: string; fields: [string, string][] }>(
        `/api/w/${workspace.slug}/billing/checkout`,
        { method: "POST", body: { plan, billing: annual ? "annual" : "monthly" }, queue: false },
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

  // A quote exists only for the cycle the live mandate is already on; anything
  // else (no mandate, cycle switch, grace, past due) is a full checkout.
  const quoteFor = (plan: "team" | "studio"): BandChangeQuote | null =>
    data?.bandChanges.find(
      (q) => q.plan === plan && q.billing === (annual ? "annual" : "monthly"),
    ) ?? null;

  const applySwitch = async (quote: BandChangeQuote) => {
    // Never let a band change sit in the offline outbox: it would replay and
    // charge long after the owner saw this screen.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast("You're offline, billing needs a connection", { variant: "error" });
      return;
    }
    setBusy(quote.plan);
    try {
      const res = await apiMutate<BandChangeOutcome>(
        `/api/w/${workspace.slug}/billing`,
        { method: "PATCH", body: { plan: quote.plan, billing: quote.billing }, queue: false },
      );
      if ("queued" in res && res.queued) {
        toast("You're offline, billing needs a connection", { variant: "error" });
        return;
      }
      // The mandate moved under us (renewal, cancel, cycle switch): fall back
      // to the full checkout rather than leaving the owner stuck.
      if (res.mode === "checkout") {
        await checkout(quote.plan);
        return;
      }
      setSwitchTo(null);
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
      if (res.mode === "noop") {
        toast(`Already on ${PLANS[quote.plan].name}.`, { variant: "success" });
        return;
      }
      if (quote.direction === "downgrade") {
        toast(
          `Done. You keep ${PLANS[currentPlan].name} until ${fmtDate(
            res.effectiveAt ?? null,
          )}, then ${PLANS[quote.plan].name}.`,
          { variant: "success" },
        );
        return;
      }
      toast(
        res.catchUpCharged && (res.catchUpCents ?? 0) > 0
          ? `You're on ${PLANS[quote.plan].name}. ${fmtCents(
              res.catchUpCents ?? 0,
            )} charged for the rest of this period.`
          : `You're on ${PLANS[quote.plan].name}, nothing extra charged this period.`,
        { variant: "success" },
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Band change failed", {
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  /** Confirm in place when we can quote it, otherwise straight to checkout. */
  const startSwitch = (plan: "team" | "studio") => {
    const quote = quoteFor(plan);
    if (quote) setSwitchTo(quote);
    else void checkout(plan);
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const res = await apiMutate<{
        remote: boolean;
        endsAt: string | null;
        immediate: boolean;
      }>(`/api/w/${workspace.slug}/billing`, {
        method: "DELETE",
        body: { reason },
        queue: false,
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug] });
      setCancelOpen(false);
      setReason(null);
      // If PayFast couldn't confirm the stop, say so plainly, otherwise the
      // customer thinks they're done and a charge still lands.
      if ("remote" in res && res.remote === false) {
        toast(
          "We couldn't confirm the stop with PayFast. Check your PayFast account or contact us so no further charge lands.",
          { variant: "error" },
        );
        return;
      }
      toast(
        "immediate" in res && res.immediate
          ? "Cancelled, you're on Free. Nothing was deleted."
          : `Cancelled. You keep ${PLANS[currentPlan].name} until ${fmtDate(
              ("endsAt" in res && res.endsAt) || null,
            )}, then Free.`,
        { variant: "success" },
      );
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
          {sub &&
            (grace ? (
              <span className="text-xs font-medium text-warn">
                Ends {graceEnds}
              </span>
            ) : (
              <span
                className={cn(
                  "text-xs font-medium",
                  STATUS_COPY[sub.status]?.tone,
                )}
              >
                {STATUS_COPY[sub.status]?.label}
              </span>
            ))}
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

        {/* Scheduled cancel: reassure + let them undo by resuming. */}
        {grace && isOwner && (
          <div className="mt-3 rounded-control bg-raised p-3">
            <p className="flex items-start gap-2 text-xs text-muted">
              <Clock className="mt-px size-3.5 shrink-0 text-warn" />
              <span>
                Your {PLANS[currentPlan].name} plan stays active until{" "}
                <strong className="text-ink">{graceEnds}</strong>, then moves to
                Free. Your work is never deleted. Changed your mind?
              </span>
            </p>
            <Button
              size="sm"
              className="mt-2"
              loading={busy === currentPlan}
              onClick={() => void checkout(currentPlan as "team" | "studio")}
            >
              Resume {PLANS[currentPlan].name}
            </Button>
          </div>
        )}

        {/* Scheduled move down: they keep what they paid for until it lands. */}
        {scheduledBand && sub && (
          <div className="mt-3 rounded-control bg-raised p-3">
            <p className="flex items-start gap-2 text-xs text-muted">
              <Clock className="mt-px size-3.5 shrink-0 text-warn" />
              <span>
                You keep {PLANS[currentPlan].name} until{" "}
                <strong className="text-ink">
                  {fmtDate(sub.currentPeriodEnd)}
                </strong>
                , then it becomes {PLANS[scheduledBand].name} at{" "}
                {fmtCents(sub.amountCents)}/
                {sub.billing === "annual" ? "year" : "month"}. Changed your
                mind? Move back up, it costs nothing this period.
              </span>
            </p>
          </div>
        )}

        {/* Past due: tell the owner what to do and let them retry or stop. */}
        {sub?.status === "past_due" && isOwner && (
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
                onClick={() => setCancelOpen(true)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {sub?.status === "active" && !grace && isOwner && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-danger"
            onClick={() => setCancelOpen(true)}
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
          {Object.values(PLANS).map((plan) => {
            const price = annual ? plan.priceAnnualZar : plan.priceMonthlyZar;
            const currentPrice = annual
              ? PLANS[currentPlan].priceAnnualZar
              : PLANS[currentPlan].priceMonthlyZar;
            const isCurrent = currentPlan === plan.id;
            const isDowngrade = price < currentPrice;
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
                {plan.id === "free" ? (
                  isCurrent ? (
                    <p className="mt-3 text-center text-xs font-medium text-faint">
                      Your current band
                    </p>
                  ) : isOwner ? (
                    <Button
                      size="sm"
                      variant="quiet"
                      className="mt-3"
                      onClick={() => setCancelOpen(true)}
                    >
                      Move to Free
                    </Button>
                  ) : null
                ) : isCurrent ? (
                  <p className="mt-3 text-center text-xs font-medium text-faint">
                    Your current band
                  </p>
                ) : plan.id === scheduledBand ? (
                  <p className="mt-3 text-center text-xs font-medium text-warn">
                    Starts {fmtDate(sub?.currentPeriodEnd ?? null)}
                  </p>
                ) : isOwner ? (
                  <Button
                    size="sm"
                    className="mt-3"
                    variant={isDowngrade ? "quiet" : "primary"}
                    loading={busy === plan.id}
                    onClick={() => startSwitch(plan.id as "team" | "studio")}
                  >
                    {isDowngrade ? "Switch to" : "Upgrade to"} {plan.name}
                  </Button>
                ) : (
                  <p className="mt-3 text-center text-xs text-faint">
                    Only the owner can change billing
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-faint">
          {data && data.bandChanges.length > 0 ? (
            <>
              Moving up starts straight away and you pay only for the days left
              in this period. Moving down keeps your current band until the
              period you&apos;ve paid for ends, then bills the smaller amount,
              we don&apos;t refund the difference. You&apos;ll see the exact
              rand before you confirm. Cancelling also keeps your plan until the
              paid period ends.
            </>
          ) : (
            <>
              Switching band or billing cycle starts a fresh period at the full
              price. Cancelling keeps your plan until the period you&apos;ve
              paid for ends.
            </>
          )}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
          <ShieldCheck className="size-3.5" />
          VAT inclusive · billed in rand via PayFast · card details never touch
          Alpha · your work stays either way.
        </p>
      </section>

      {/* Band change: say exactly what happens and what it costs, then commit. */}
      <Dialog
        open={switchTo !== null}
        onClose={() => setSwitchTo(null)}
        ariaLabel="Confirm band change"
        variant="center"
      >
        {switchTo && (
          <>
            <DialogHeader
              title={`Move to ${PLANS[switchTo.plan].name}?`}
              onClose={() => setSwitchTo(null)}
            />
            <div className="space-y-4 p-4">
              {switchTo.direction === "upgrade" ? (
                <p className="text-sm text-muted">
                  {PLANS[switchTo.plan].name} starts now.{" "}
                  {switchTo.catchUpCents > 0 ? (
                    <>
                      You pay{" "}
                      <strong className="text-ink tabular">
                        {fmtCents(switchTo.catchUpCents)}
                      </strong>{" "}
                      today for the rest of this period, then{" "}
                      {fmtCents(switchTo.recurringCents)}/
                      {switchTo.billing === "annual" ? "year" : "month"} from{" "}
                      <strong className="text-ink">
                        {fmtDate(sub?.currentPeriodEnd ?? null)}
                      </strong>
                      .
                    </>
                  ) : (
                    <>
                      There&apos;s too little of this period left to charge for,
                      so nothing comes off your card today. From{" "}
                      <strong className="text-ink">
                        {fmtDate(sub?.currentPeriodEnd ?? null)}
                      </strong>{" "}
                      it&apos;s {fmtCents(switchTo.recurringCents)}/
                      {switchTo.billing === "annual" ? "year" : "month"}.
                    </>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  You keep {PLANS[currentPlan].name} until{" "}
                  <strong className="text-ink">
                    {fmtDate(switchTo.effectiveAt)}
                  </strong>
                  , the time you&apos;ve already paid for. From then it&apos;s{" "}
                  {PLANS[switchTo.plan].name} at{" "}
                  {fmtCents(switchTo.recurringCents)}/
                  {switchTo.billing === "annual" ? "year" : "month"}. Nothing is
                  charged today and we don&apos;t refund the difference for the
                  rest of this period.
                </p>
              )}
              <p className="text-xs text-faint">
                Nothing is deleted either way, your projects, tasks and history
                all stay. VAT inclusive.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setSwitchTo(null)}>
                  Keep {PLANS[currentPlan].name}
                </Button>
                <Button
                  loading={busy === switchTo.plan}
                  onClick={() => void applySwitch(switchTo)}
                >
                  {switchTo.direction === "upgrade"
                    ? `Pay ${
                        switchTo.catchUpCents > 0
                          ? fmtCents(switchTo.catchUpCents)
                          : "nothing"
                      } and move up`
                    : `Move to ${PLANS[switchTo.plan].name}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>

      {/* Cancellation experience: calm, honest, one soft off-ramp. */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        ariaLabel="Cancel subscription"
        variant="center"
      >
        <DialogHeader
          title={`Cancel ${PLANS[currentPlan].name}?`}
          onClose={() => setCancelOpen(false)}
        />
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted">
            {sub?.currentPeriodEnd ? (
              <>
                You&apos;ll keep {PLANS[currentPlan].name} until{" "}
                <strong className="text-ink">
                  {fmtDate(sub.currentPeriodEnd)}
                </strong>
                , the time you&apos;ve already paid for. After that you move to
                Free. Nothing is deleted, your projects, tasks and history all
                stay.
              </>
            ) : (
              <>
                You&apos;ll move to Free. Nothing is deleted, your projects,
                tasks and history all stay.
              </>
            )}
          </p>

          {/* Retention: a softer step for the biggest reason to leave. */}
          {currentPlan === "studio" && (
            <div className="rounded-control bg-accent-soft p-3">
              <p className="text-xs text-muted">
                Only need less? Team keeps every feature at a smaller size for{" "}
                {formatZar(PLANS.team.priceMonthlyZar)}/month.
              </p>
              <Button
                size="sm"
                variant="quiet"
                className="mt-2"
                loading={busy === "team"}
                onClick={() => {
                  setCancelOpen(false);
                  startSwitch("team");
                }}
              >
                Switch to Team instead
              </Button>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-faint">
              Mind sharing why? (optional)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason((cur) => (cur === r ? null : r))}
                  className={cn(
                    "press rounded-full border px-3 py-1.5 text-xs",
                    reason === r
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line text-muted hover:border-accent/40",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep {PLANS[currentPlan].name}
            </Button>
            <Button
              variant="quiet"
              className="text-danger"
              loading={busy === "cancel"}
              onClick={() => void cancel()}
            >
              Cancel plan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
