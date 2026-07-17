/**
 * "It reports itself": copy beside a live-feeling dashboard collage. KPI
 * tiles rise in, momentum blocks pop one by one, then the Monday briefing
 * writes itself line by line and the delivery chip lands. All choreography
 * is CSS one-shots gated by <InView>; server component, zero client JS here.
 */
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
      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
          {/* ------------------------------ copy ---------------------------- */}
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              It reports itself
            </p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Nobody compiles a status report. Ever again.
            </h2>
            <p className="mt-3 max-w-prose text-pretty text-muted">
              Zero-setup KPIs read straight from the work: what got done, what
              slipped, who&rsquo;s overloaded, which client project has gone
              quiet. Every Monday a short, human briefing lands in-app, by email
              and by push, written like a sharp ops lead, not a data dump.
            </p>
          </Reveal>

          {/* ------------------------ live dashboard ------------------------ */}
          <div aria-hidden>
            <InView className="grid gap-2">
              {/* KPI tiles */}
              <div className="grid grid-cols-3 gap-2">
                <div className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-4">
                  <p className="text-[11px] font-medium leading-tight text-faint">
                    Completion rate
                  </p>
                  <p className="tabular mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    <CountUp value={62} suffix="%" />
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">this week</p>
                </div>
                <div
                  className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-4"
                  style={{ animationDelay: "110ms" }}
                >
                  <p className="text-[11px] font-medium leading-tight text-faint">
                    Overdue
                  </p>
                  <p className="tabular mt-1 text-xl font-semibold tracking-tight text-danger sm:text-2xl">
                    <CountUp value={3} />
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    need a decision
                  </p>
                </div>
                <div
                  className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-4"
                  style={{ animationDelay: "220ms" }}
                >
                  <p className="text-[11px] font-medium leading-tight text-faint">
                    Cycle time
                  </p>
                  <p className="tabular mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                    2.4d
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    created to done
                  </p>
                </div>
              </div>

              {/* momentum strip */}
              <div
                className="anim anim-rise grad-card rounded-card border border-dashed border-line bg-surface p-4"
                style={{ animationDelay: "330ms" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-faint">Momentum</p>
                  <p className="text-right text-xs text-faint">5 day streak</p>
                </div>
                <div className="mt-2.5 flex gap-1 sm:gap-1.5">
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
                <div className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-accent" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                      MONDAY 06:30 · WEEKLY BRIEFING
                    </p>
                  </div>
                  <TypeLines
                    lines={[
                      "The team closed out 14 tasks this week against 11 new ones.",
                      "Thabo carried 40% of completions, rebalance before it snaps.",
                      "Liberty has had nothing move in 6 days; quiet client projects are how surprises happen.",
                    ]}
                    startDelay={900}
                    step={700}
                    className="mt-3 space-y-2"
                    lineClassName="text-sm leading-relaxed text-ink/90"
                  />
                  <p className="mt-3 text-xs text-faint">
                    Written by Alpha from your team&rsquo;s actual activity.
                    Nobody compiled it.
                  </p>
                </div>

                {/* delivery chip lands after the briefing finishes writing */}
                <div
                  className="anim anim-pop absolute -right-2 -top-3"
                  style={{ animationDelay: "3200ms" }}
                >
                  <div className="anim-bob flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow">
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
