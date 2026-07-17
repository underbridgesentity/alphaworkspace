/**
 * Marketing closer, two stacked pieces:
 *  1. Manifesto band: the anti-noise law as a slim, centred dark quote.
 *  2. Final CTA: a dark rounded card inside a light section, headline,
 *     one-line pitch and the "Start free" action with a floating chip.
 * All choreography runs through the shared anim system behind InView gates.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InView } from "@/components/marketing/in-view";

export function Closing() {
  return (
    <>
      {/* --------------------------- manifesto band --------------------------- */}
      <section className="section-invert relative overflow-hidden border-y border-dashed border-line bg-bg text-ink">
        <div aria-hidden className="streak left-[-6%] top-[8%]" />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-14 md:px-8">
          <InView className="mx-auto max-w-3xl text-center">
            <blockquote className="anim anim-rise text-balance text-lg font-medium tracking-tight sm:text-2xl">
              {"“Every feature must reduce follow-up messages between humans, or it doesn't ship.”"}
            </blockquote>
            <p
              className="anim anim-rise mt-3 text-sm text-faint"
              style={{ animationDelay: "150ms" }}
            >
              {"The anti-noise law. It's why Alpha exists."}
            </p>
          </InView>
        </div>
      </section>

      {/* ----------------------------- final CTA ------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8">
          <div className="section-invert relative overflow-hidden rounded-card bg-bg px-6 py-14 text-center text-ink sm:px-14">
            <div aria-hidden className="streak bottom-[-20%] right-[-10%]" />
            <InView>
              <div className="relative">
                <h2 className="anim anim-rise text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  Your Monday briefing could write itself next week.
                </h2>
                <p
                  className="anim anim-rise mx-auto mt-3 max-w-prose text-muted"
                  style={{ animationDelay: "120ms" }}
                >
                  Set up in under two minutes. Free for teams of three, no
                  card, no trial clock.
                </p>
                <div
                  className="anim anim-pop mt-7"
                  style={{ animationDelay: "260ms" }}
                >
                  <Link
                    href="/sign-in"
                    className="press inline-flex items-center gap-2 rounded-[0.625rem] bg-accent px-7 py-3 font-semibold text-on-accent hover:bg-accent-hover"
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
                <div className="anim-bob flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow">
                  <span className="size-1.5 rounded-full bg-accent" />
                  2 minute setup
                </div>
              </div>
            </InView>
          </div>
        </div>
      </section>
    </>
  );
}
