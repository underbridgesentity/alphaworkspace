/**
 * Marketing section: scorecards + time tracking, "for the numbers work
 * can't count". Dark (inverted) band; copy right, animated scorecard demo
 * left on md+. All choreography runs through the shared anim system and
 * only starts once the InView gate opens.
 */
import { Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";
import { Parallax } from "@/components/marketing/parallax";
import { Reveal } from "@/components/marketing/reveal";
import { Blob } from "@/components/marketing/blob";

const SCORECARDS: Array<{
  label: string;
  target: string | null;
  value: string;
  fill: string;
  delay: number;
  valueClass?: string;
}> = [
  {
    label: "New business calls",
    target: "target 10",
    value: "7",
    fill: "w-[70%] bg-accent/70",
    delay: 300,
  },
  {
    label: "Invoices sent",
    target: "target 12",
    value: "12",
    fill: "w-full bg-accent",
    delay: 500,
    valueClass: "text-on-accent",
  },
  {
    label: "Client check-ins",
    target: null,
    value: "5",
    fill: "w-[45%] bg-accent/50",
    delay: 700,
  },
];

const HOURS: Array<{
  name: string;
  initial: string;
  color: string;
  fill: string;
  delay: number;
  time: string;
}> = [
  {
    name: "Thabo",
    initial: "T",
    color: "#5B7C99",
    fill: "w-[80%]",
    delay: 1300,
    time: "6h 40m",
  },
  {
    name: "Naledi",
    initial: "N",
    color: "#6FAE87",
    fill: "w-[55%]",
    delay: 1450,
    time: "4h 05m",
  },
];

export function Numbers() {
  return (
    <section className="section-invert relative overflow-hidden border-y border-dashed border-line bg-bg text-ink">
      <Blob
        className="left-[-12%] top-[-24%] h-[20rem] w-[24rem]"
        morph={22}
        drift={42}
        strength={0.05}
      />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          {/* ----------------------------- demo ----------------------------- */}
          <Reveal delay={120} className="order-2 md:order-1">
            <Parallax speed={0.05}>
              <InView className="relative">
                <div
                  aria-hidden
                  className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-5"
                >
                  {/* Scorecard rows */}
                  <div className="space-y-4">
                    {SCORECARDS.map((row) => (
                      <div key={row.label}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">{row.label}</p>
                          {row.target && (
                            <span className="rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-faint">
                              {row.target}
                            </span>
                          )}
                        </div>
                        <div className="relative h-6 overflow-hidden rounded-[6px] bg-raised">
                          <div
                            className={cn(
                              "anim anim-grow-x h-full rounded-[6px]",
                              row.fill,
                            )}
                            style={{ animationDelay: `${row.delay}ms` }}
                          />
                          {/* Label lives outside the scaled fill so it never stretches. */}
                          <span
                            className={cn(
                              "tabular absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold",
                              row.valueClass,
                            )}
                          >
                            {row.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hairline-fade my-4" />

                  {/* Running timer */}
                  <div
                    className="anim anim-rise flex items-center gap-2.5"
                    style={{ animationDelay: "1000ms" }}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Timer className="size-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">
                      Design pass · running
                    </p>
                    <span className="tabular flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent">
                      <span className="size-1.5 animate-pulse rounded-full bg-current opacity-70" />
                      1h 24m
                    </span>
                  </div>

                  {/* Where the week's hours went, per person */}
                  <div
                    className="anim anim-rise mt-4 space-y-2"
                    style={{ animationDelay: "1200ms" }}
                  >
                    {HOURS.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.initial}
                        </span>
                        <span className="w-16 shrink-0 truncate text-xs text-muted">
                          {p.name}
                        </span>
                        <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-[6px] bg-raised">
                          <div
                            className={cn(
                              "anim anim-grow-x h-full rounded-[6px] bg-accent/60",
                              p.fill,
                            )}
                            style={{ animationDelay: `${p.delay}ms` }}
                          />
                        </div>
                        <span className="tabular w-12 shrink-0 text-right text-[11px] text-muted">
                          {p.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating status chip */}
                <div
                  aria-hidden
                  className="anim anim-pop absolute -top-3 right-6"
                  style={{ animationDelay: "1900ms" }}
                >
                  <div className="anim-bob flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow">
                    <span className="size-1.5 rounded-full bg-accent" />
                    In Monday’s briefing too
                  </div>
                </div>
              </InView>
            </Parallax>
          </Reveal>

          {/* ----------------------------- copy ----------------------------- */}
          <Reveal className="order-1 md:order-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              For the numbers work can’t count
            </p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Scorecards and time, beside the work.
            </h2>
            <p className="mt-3 max-w-prose text-muted">
              New business calls, invoices sent, client NPS: add a scorecard
              and fill in one number a week, it lands in the Monday briefing
              with everything else. Start a timer on any task and see where the
              week’s hours actually went.
            </p>
            <p className="mt-3 text-xs text-faint">
              Both come with the paid plans, Team and Studio alike.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
