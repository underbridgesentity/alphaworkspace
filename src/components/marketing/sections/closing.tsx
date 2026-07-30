/**
 * Marketing closer: just the ask.
 *
 * The three-fact proof strip that used to sit under the card (rand, bad
 * line, POPIA) moved into the built-for-here ink band, where those claims
 * now live once, with room to breathe. Repeating them here made the page's
 * last note a recap instead of a decision, and repetition reads as
 * insecurity. What remains is one card, one sentence of risk-reversal that
 * is actually true for the free band, and one button.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InView } from "@/components/marketing/in-view";

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
      </div>
    </section>
  );
}
