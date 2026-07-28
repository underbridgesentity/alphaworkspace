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
          plan.meetingMinutesPerMonth >= 120
            ? `${Math.round(plan.meetingMinutesPerMonth / 60)} hours of meeting transcription a month`
            : `${plan.meetingMinutesPerMonth} meeting minutes a month`,
          plan.attachmentQuotaMb >= 1024
            ? `${Math.round(plan.attachmentQuotaMb / 1024)} GB attachment storage`
            : `${plan.attachmentQuotaMb} MB attachment storage`,
          "Weekly narrative briefing",
          ...(plan.features.includes("morning_brief") ? ["Personal morning brief"] : []),
          ...(plan.features.includes("scorecards")
            ? ["Scorecards for the numbers you steer by"]
            : []),
          // "as they ship" was a hedge left over from before Phase 2 landed.
          // Both are shipped; saying otherwise on the pricing card reads as a
          // roadmap promise and costs trust.
          ...(plan.features.includes("time_tracking")
            ? ["Time tracking and client reports"]
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
              <p className="mb-sibling w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-semibold text-accent">
                Most teams land here
              </p>
            )}
            <h3 className="text-title">{plan.name}</h3>
            <p className="mt-hair text-dense text-muted">{plan.tagline}</p>
            {/* The price is the number the page is building towards, so it is
                the only display-scale figure in the card. */}
            <p className="mt-item num-hero">
              {plan.priceMonthlyZar === 0 ? "R0" : formatZar(plan.priceMonthlyZar)}
              <span className="ml-0.5 text-meta font-normal text-faint">/month</span>
            </p>
            <p className="mt-tight text-meta text-faint">
              {plan.priceMonthlyZar === 0
                ? "Free forever"
                : `or ${formatZar(plan.priceAnnualZar)}/year, two months free`}
            </p>
            <ul className="mt-item flex-1 space-y-sibling text-dense text-muted">
              {rows.map((row) => (
                <li key={row} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                  {row}
                </li>
              ))}
            </ul>
            <Link
              href={
                plan.id === "free"
                  ? "/sign-in"
                  : `/sign-in?next=${encodeURIComponent(`/app?plan=${plan.id}`)}`
              }
              className={cn(
                "press mt-group rounded-control py-2.5 text-center text-body font-semibold",
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

/**
 * Deliberately narrow. The rand/VAT/PayFast facts moved to the proof strip in
 * <Closing>, so this footnote is left with the one thing nothing else on the
 * page says: what happens if you stop paying.
 */
export function PricingFootnote() {
  return (
    <p className="mt-item text-center text-meta text-faint">
      Change or cancel any time. A cancelled workspace drops back to Free at
      the end of the period you paid for. Nothing is deleted.
    </p>
  );
}
