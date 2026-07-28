/**
 * Marketing closer: the ask, then the three facts that answer the last
 * silent objection ("is this actually built for us?").
 *
 * The manifesto band that used to sit here was cut. It quoted an internal
 * product law ("the anti-noise law") at a customer who has never heard of
 * it, spent a whole dark band on one sentence, and did it between the price
 * and the button, which is the worst possible place to interrupt someone.
 * The same idea now lives where it is earned, under the follow-up demo.
 *
 * The strip below the card replaces the old audience-pill belt. A belt
 * reading "Agencies, Design studios, Dev shops, Ops teams..." is a taxonomy
 * that excludes nobody, so it says nothing. These three are checkable claims
 * an offshore competitor cannot make, sitting exactly where a South African
 * buyer decides whether this product was built with them in mind.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";

const PROOF: Array<{ label: string; body: string }> = [
  {
    label: "In rand",
    body:
      "R0, R499 or R999 a month, VAT inclusive, billed through PayFast. No card in dollars, no forex surprise on the statement.",
  },
  {
    label: "On a bad line",
    body:
      "Reads come from cache, writes queue on the phone until signal returns. It installs from the browser, not from an app store.",
  },
  {
    label: "Your data, POPIA",
    body:
      "Export everything you have put in, or delete your account outright, from the settings page. Neither needs a support ticket.",
  },
];

export function Closing() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8">
        {/* ------------------------------ the ask ---------------------------- */}
        <div className="section-invert relative overflow-hidden rounded-card bg-bg px-6 py-14 text-center text-ink sm:px-14">
          <div aria-hidden className="streak bottom-[-20%] right-[-10%]" />
          <InView>
            <div className="relative">
              <h2 className="anim anim-rise text-balance text-display-sm sm:text-display">
                Your Monday briefing could write itself next week.
              </h2>
              <p
                className="anim anim-rise mx-auto mt-item max-w-prose text-lede text-muted"
                style={{ animationDelay: "120ms" }}
              >
                Free for three people, forever. No card, no trial clock, no
                call with anyone.
              </p>
              <div
                className="anim anim-pop mt-group"
                style={{ animationDelay: "260ms" }}
              >
                <Link
                  href="/sign-in"
                  className="press inline-flex items-center gap-2 rounded-control bg-accent px-7 py-3 font-semibold text-on-accent hover:bg-accent-hover"
                >
                  Start free
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            {/* Floating status chip */}
            <div
              aria-hidden
              className="anim anim-pop absolute left-5 top-5 sm:left-9 sm:top-8"
              style={{ animationDelay: "700ms" }}
            >
              <div className="anim-bob flex items-center gap-tight rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                <span className="size-1.5 rounded-full bg-accent" />
                2 minute setup
              </div>
            </div>
          </InView>
        </div>

        {/* --------------------- built here, three facts --------------------- */}
        <div className="mt-section grid gap-group sm:grid-cols-3 sm:gap-8">
          {PROOF.map((item, i) => (
            <Reveal key={item.label} delay={i * 90}>
              <h3 className="section-head">{item.label}</h3>
              <p className="mt-tight text-dense text-muted">{item.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
