/**
 * "It reports itself": copy beside a live-feeling dashboard collage.
 *
 * The KPI block is deliberately NOT three identical tiles. Completion rate is
 * the number an agency owner actually reports upward, so it gets the hero
 * treatment plus the LEDGER LINE (globals.css, signature 2): the figure sits
 * on a 2px rule filled to its own share, so magnitude is legible with no
 * chart and no legend. Overdue and cycle time sit a step down. Hierarchy is
 * the point; a row of equals reads as a row of nothings.
 *
 * All choreography is CSS one-shots gated by <InView>; server component,
 * zero client JS here beyond CountUp and TypeLines.
 */
import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";
import { CountUp } from "@/components/marketing/count-up";
import { TypeLines } from "@/components/marketing/type-lines";
import { Reveal } from "@/components/marketing/reveal";

/** 12 days of momentum: mixed intensity, 2 quiet days, ends on a 5-day run. */
const MOMENTUM = [
  "bg-accent/30",
  "bg-accent/55",
  "bg-raised",
  "bg-accent/55",
  "bg-accent/30",
  "bg-accent",
  "bg-raised",
  "bg-accent/55",
  "bg-accent/30",
  "bg-accent/55",
  "bg-accent",
  "bg-accent",
];

export function Report() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="streak left-[-12%] bottom-[10%]"
        style={{ animationDelay: "4s" }}
      />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="grid items-center gap-group md:grid-cols-2 md:gap-14">
          {/* ------------------------------ copy ---------------------------- */}
          <Reveal>
            <p className="section-head">It reports itself</p>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              Nobody compiles the status report.
            </h2>
            <p className="mt-item max-w-prose text-pretty text-lede text-muted">
              The KPIs read straight from the work, with nothing to set up:
              what closed, what slipped, who is carrying too much, which client
              project has gone quiet. By 06:30 on Monday the week is written up
              and sent, in-app, by email and by push.
            </p>
            <p className="mt-group text-body text-faint">
              By the time the first client email arrives, you already know
              what to tell them.
            </p>
          </Reveal>

          {/* ------------------------ live dashboard ------------------------ */}
          <div aria-hidden>
            <InView className="grid gap-sibling">
              {/* The number you report upward, on its ledger line. */}
              <div className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-item">
                <p className="section-head">Completion rate, this week</p>
                <p className="ledger mt-tight num-hero">
                  <CountUp value={62} suffix="%" />
                  <span className="ledger-track">
                    <span
                      className="ledger-fill"
                      style={{ "--fill": 0.62 } as CSSProperties}
                    />
                  </span>
                </p>
                <p className="mt-tight text-meta text-faint">
                  14 of 22 closed, up from 51% last week
                </p>
              </div>

              {/* A step down: the two numbers that need a decision, not a report. */}
              <div className="grid grid-cols-2 gap-sibling">
                <div
                  className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-item"
                  style={{ animationDelay: "110ms" }}
                >
                  <p className="section-head">Overdue</p>
                  <p className="mt-tight num text-display-sm text-danger">
                    <CountUp value={3} />
                  </p>
                  <p className="mt-hair text-meta text-faint">
                    need a decision
                  </p>
                </div>
                <div
                  className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-item"
                  style={{ animationDelay: "220ms" }}
                >
                  <p className="section-head">Cycle time</p>
                  <p className="mt-tight num text-display-sm">2.4d</p>
                  <p className="mt-hair text-meta text-faint">
                    created to done
                  </p>
                </div>
              </div>

              {/* momentum strip */}
              <div
                className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-item"
                style={{ animationDelay: "330ms" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="section-head">Momentum</p>
                  <p className="text-meta text-faint">5 day streak</p>
                </div>
                <div className="mt-tight flex gap-1 sm:gap-1.5">
                  {MOMENTUM.map((tone, i) => (
                    <span
                      key={i}
                      className={cn(
                        "anim anim-pop size-4 rounded-[5px] sm:size-5",
                        tone,
                      )}
                      style={{ animationDelay: `${400 + i * 70}ms` }}
                    />
                  ))}
                </div>
              </div>

              {/* weekly briefing writes itself */}
              <div
                className="anim anim-rise relative"
                style={{ animationDelay: "500ms" }}
              >
                <div className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-item sm:p-5">
                  <div className="flex items-center gap-tight">
                    <Sparkles className="size-4 text-accent" />
                    <p className="section-head">
                      Monday 06:30 · Weekly briefing
                    </p>
                  </div>
                  <TypeLines
                    lines={[
                      "The team closed out 14 tasks this week against 11 new ones.",
                      "Thabo carried 40% of completions, rebalance before it snaps.",
                      "Sable has had nothing move in 6 days; quiet client projects are how surprises happen.",
                    ]}
                    startDelay={900}
                    step={700}
                    className="mt-item space-y-sibling"
                    lineClassName="text-dense leading-relaxed text-ink/90"
                  />
                  <p className="mt-item text-meta text-faint">
                    Assembled from what actually happened. Nobody sat down to
                    write it.
                  </p>
                </div>

                {/* delivery chip lands after the briefing finishes writing */}
                <div
                  className="anim anim-pop absolute -right-2 -top-3"
                  style={{ animationDelay: "3200ms" }}
                >
                  <div className="anim-bob flex items-center gap-tight whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Landed Monday 06:30
                  </div>
                </div>
              </div>
            </InView>
          </div>
        </div>
      </div>
    </section>
  );
}
