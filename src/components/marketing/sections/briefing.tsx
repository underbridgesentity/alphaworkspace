/**
 * "It reports itself": the weekly narrative and Pulse, shown with the real
 * thing instead of a hand-built collage.
 *
 * Composition: the Pulse dashboard sits in the page's hairline frame
 * (.mkt-frame), and the tight crop of the weekly-briefing card overlaps its
 * lower-left corner as a second, smaller frame. The layered-crop is the
 * point: the big shot says "there is a real dashboard", the overlap says
 * "and this paragraph is the part a human actually reads". Same treatment
 * on both, per the one-frame rule.
 *
 * At 375px: the overlap unstacks. An absolutely positioned card over a
 * 335px-wide dashboard would cover half of it, so on mobile the briefing
 * crop renders as a normal block above the dashboard frame, and the
 * dashboard crops harder (squarer aspect) so its type stays legible-ish as
 * texture while the briefing crop, at 3.5:1, stays actually readable.
 * Everything below the fold, everything lazy.
 */
import Image from "next/image";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";

export function Briefing() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="streak left-[-12%] bottom-[10%]"
        style={{ animationDelay: "4s" }}
      />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="grid items-center gap-group md:grid-cols-[0.9fr_1.1fr] md:gap-14">
          {/* ------------------------------ copy ---------------------------- */}
          <Reveal>
            <p className="section-head">It reports itself</p>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              Nobody compiles the status report.
            </h2>
            <p className="mt-item max-w-prose text-pretty text-lede text-muted">
              Pulse reads straight from the work, with nothing to set up: what
              closed, what slipped, which client project has gone quiet. By
              06:30 on Monday the week is written up in plain sentences and
              sent, in-app, by email and by push.
            </p>
            <p className="mt-group text-body text-faint">
              By the time the first client email arrives, you already know
              what to tell them.
            </p>
          </Reveal>

          {/* --------------------- the real dashboard ----------------------- */}
          <InView className="relative">
            {/* Briefing crop first in DOM: on mobile it reads as the lead
                image; on sm+ it leaves this flow position and overlaps the
                dashboard's corner instead. */}
            <div
              className="anim anim-rise relative z-10 mb-sibling sm:absolute sm:-bottom-6 sm:-left-6 sm:mb-0 sm:w-[78%]"
              style={{ animationDelay: "220ms" }}
            >
              <div className="mkt-frame">
                <Image
                  src="/marketing/shots/weekly-briefing-card-light.png"
                  alt="A weekly briefing written by Alpha Workspace: 'The team closed out 7 tasks this week against 3 new ones coming in. Lerato Mokoena led the way with 2 completions.'"
                  width={848}
                  height={240}
                  sizes="(min-width: 48rem) 26rem, 100vw"
                  className="h-auto w-full"
                />
              </div>
            </div>

            <div className="anim anim-rise">
              {/* The crop is doing real work: at 16:10 the app's sidebar
                  survives as sliced half-words, which reads as sloppy, so the
                  frame is squarer than the bitmap and the right-aligned
                  object position pushes the whole sidebar off the left edge.
                  Mobile crops harder still (4/3.2) so the KPI tiles stay
                  large, anchored at 70% so the Pulse header keeps its
                  breathing room. */}
              <div className="mkt-frame relative aspect-[4/3.2] sm:aspect-[7/5]">
                <Image
                  src="/marketing/shots/pulse-desktop-light.png"
                  alt="The Pulse dashboard in Alpha Workspace: weekly briefing up top, then completion rate, done this week, overdue and stale tiles"
                  fill
                  sizes="(min-width: 64rem) 34rem, 100vw"
                  className="object-cover object-[70%_0%] sm:object-[100%_0%]"
                />
              </div>
            </div>

            {/* Delivery chip, the one floating ornament. Hidden on mobile:
                with the frames stacked there it would sit on the briefing
                card's own header text instead of on empty frame chrome. */}
            <div
              aria-hidden
              className="anim anim-pop absolute -top-3 right-4 hidden sm:block"
              style={{ animationDelay: "700ms" }}
            >
              <div className="anim-bob flex items-center gap-tight whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                <span className="size-1.5 rounded-full bg-accent" />
                Landed Monday 06:30
              </div>
            </div>
          </InView>
        </div>
      </div>
    </section>
  );
}
