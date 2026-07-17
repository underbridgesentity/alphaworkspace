import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { PLANS, formatZar } from "@/lib/plans";
import { cn } from "@/lib/cn";

/** The three bands, rendered straight from the entitlements config. */
export function PricingCards({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Object.values(PLANS).map((plan, planIndex) => {
        const highlight = plan.id === "team";
        const rows = [
          `Up to ${plan.maxMembers} people, one flat price`,
          plan.maxActiveProjects === null
            ? "Unlimited projects"
            : `${plan.maxActiveProjects} active projects`,
          `${plan.voiceCapturesPerMonth} voice captures a month`,
          "Weekly narrative briefing",
          ...(plan.features.includes("morning_brief") ? ["Personal morning brief"] : []),
          ...(plan.features.includes("scorecards")
            ? ["Scorecards, time tracking & client reports, as they ship"]
            : []),
          ...(detailed
            ? ["Offline-first PWA", "Boards, My Work, search, calendar"]
            : []),
        ];
        return (
          <Reveal key={plan.id} delay={planIndex * 110}>
          <div
            className={cn(
              "grad-card card-lift flex h-full flex-col rounded-card border border-dashed bg-surface p-5",
              highlight ? "border-ink/40" : "border-line",
            )}
          >
            {highlight && (
              <p className="mb-2 w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                Most teams land here
              </p>
            )}
            <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-0.5 text-sm text-muted">{plan.tagline}</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight tabular">
              {plan.priceMonthlyZar === 0 ? "R0" : formatZar(plan.priceMonthlyZar)}
              <span className="text-sm font-normal text-faint">/month</span>
            </p>
            <p className="mt-0.5 text-xs text-faint">
              {plan.priceMonthlyZar === 0
                ? "Free forever"
                : `or ${formatZar(plan.priceAnnualZar)}/year, two months free`}
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
              {rows.map((row) => (
                <li key={row} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                  {row}
                </li>
              ))}
            </ul>
            <Link
              href="/sign-in"
              className={cn(
                "press mt-5 rounded-control py-2.5 text-center text-sm font-semibold",
                highlight
                  ? "bg-accent text-on-accent hover:bg-accent-hover"
                  : "bg-raised text-ink hover:bg-overlay",
              )}
            >
              {plan.id === "free" ? "Start free" : `Start with ${plan.name}`}
            </Link>
          </div>
          </Reveal>
        );
      })}
    </div>
  );
}

export function PricingFootnote() {
  return (
    <p className="mt-4 text-center text-xs text-faint">
      Prices in rand, VAT inclusive · billed via PayFast · no per-seat maths ·
      cancel anytime and keep everything on Free.
    </p>
  );
}
