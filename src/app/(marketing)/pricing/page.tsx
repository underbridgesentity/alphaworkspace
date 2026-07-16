import type { Metadata } from "next";
import Link from "next/link";
import { PricingCards, PricingFootnote } from "@/components/marketing/pricing-cards";
import { PLANS, formatZar } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat rand bands for the whole team, VAT inclusive, billed via PayFast. Free for teams of three.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Why flat bands instead of per-seat pricing?",
    a: "Per-seat pricing punishes adoption — every new teammate becomes a line item to justify. A band is one number your finance person approves once. Add people freely until the band is full; then the next band is one click.",
  },
  {
    q: "Is VAT included?",
    a: "Yes. Every price you see is in rand and VAT inclusive. What's on the page is what leaves the account.",
  },
  {
    q: "What happens when we hit a limit?",
    a: "A friendly prompt shows you the next band — that's all. Nothing is deleted, nothing locks, and everything you've made stays exactly where it is. Limits gate adding more, never using what exists.",
  },
  {
    q: "How do we pay?",
    a: "Through PayFast, South Africa's payment provider — debit order off a card, in rand. Card details never touch Alpha's servers. Annual billing gives you two months free.",
  },
  {
    q: "What if we cancel?",
    a: `You drop to the Free band and keep everything — every project, task, comment and briefing. If you're within Free's limits (${PLANS.free.maxMembers} people, ${PLANS.free.maxActiveProjects} active projects) nothing even changes day to day.`,
  },
  {
    q: "What does the weekly narrative cost?",
    a: "Nothing extra — it's included on every band, including Free. It's the whole point of the product; we want you to taste it.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-20 pt-10 md:px-8">
      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        One number. The whole team.
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-muted">
        Rand pricing, VAT inclusive, via PayFast. Annual billing is two months
        free — {formatZar(PLANS.team.priceAnnualZar)}/year for Team,{" "}
        {formatZar(PLANS.studio.priceAnnualZar)}/year for Studio.
      </p>

      <div className="mt-10">
        <PricingCards detailed />
        <PricingFootnote />
      </div>

      <section className="mx-auto mt-16 max-w-2xl" aria-label="Frequently asked questions">
        <h2 className="text-xl font-semibold tracking-tight">Fair questions</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-card bg-surface px-4 py-3">
              <summary className="cursor-pointer select-none text-sm font-medium">
                {item.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center">
          <Link
            href="/sign-in"
            className="press inline-block rounded-[0.625rem] bg-accent px-6 py-3 font-semibold text-on-accent hover:bg-accent-hover"
          >
            Start free — upgrade when it earns it
          </Link>
        </p>
      </section>
    </div>
  );
}
