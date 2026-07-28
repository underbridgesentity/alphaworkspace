/**
 * Marketing section: scorecards + time tracking, "for the numbers the board
 * cannot see". Dark (inverted) band; copy right, animated scorecard demo
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
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="grid items-center gap-group md:grid-cols-2 md:gap-14">
          {/* ----------------------------- demo ----------------------------- */}
          <Reveal delay={120} className="order-2 md:order-1">
            <Parallax speed={0.05}>
              <InView className="relative">
                <div
                  aria-hidden
                  className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-5"
                >
                  {/* Scorecard rows */}
                  <div className="space-y-item">
                    {SCORECARDS.map((row) => (
                      <div key={row.label}>
                        <div className="mb-tight flex items-center justify-between gap-2">
                          <p className="text-meta font-medium">{row.label}</p>
                          {row.target && (
                            <span className="rounded-full bg-raised px-2 py-0.5 text-micro text-faint">
                              {row.target}
                            </span>
                          )}
                        </div>
                        <div className="relative h-6 overflow-hidden rounded-chip bg-raised">
                          <div
                            className={cn(
                              "anim anim-grow-x h-full rounded-chip",
                              row.fill,
                            )}
                            style={{ animationDelay: `${row.delay}ms` }}
                          />
                          {/* Label lives outside the scaled fill so it never stretches. */}
                          <span
                            className={cn(
                              "num absolute right-2 top-1/2 -translate-y-1/2 text-micro font-semibold",
                              row.valueClass,
                            )}
                          >
                            {row.value}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hairline-fade my-item" />

                  {/* Running timer */}
                  <div
                    className="anim anim-rise flex items-center gap-2.5"
                    style={{ animationDelay: "1000ms" }}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Timer className="size-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-body">
                      Design pass · running
                    </p>
                    <span className="num flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-meta font-semibold text-on-accent">
                      <span className="size-1.5 animate-pulse rounded-full bg-current opacity-70" />
                      1h 24m
                    </span>
                  </div>

                  {/* Where the week's hours went, per person */}
                  <div
                    className="anim anim-rise mt-item space-y-sibling"
                    style={{ animationDelay: "1200ms" }}
                  >
                    {HOURS.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.initial}
                        </span>
                        <span className="w-16 shrink-0 truncate text-meta text-muted">
                          {p.name}
                        </span>
                        <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-chip bg-raised">
                          <div
                            className={cn(
                              "anim anim-grow-x h-full rounded-chip bg-accent/60",
                              p.fill,
                            )}
                            style={{ animationDelay: `${p.delay}ms` }}
                          />
                        </div>
                        <span className="num w-12 shrink-0 text-right text-micro text-muted">
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
                  <div className="anim-bob flex items-center gap-tight rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                    <span className="size-1.5 rounded-full bg-accent" />
                    In Monday&rsquo;s briefing too
                  </div>
                </div>
              </InView>
            </Parallax>
          </Reveal>

          {/* ----------------------------- copy ----------------------------- */}
          <Reveal className="order-1 md:order-2">
            <p className="section-head">The numbers the board can&rsquo;t see</p>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              The number you steer by, and where the hours went.
            </h2>
            <p className="mt-item max-w-prose text-lede text-muted">
              New business calls made. Invoices sent. Add the number you
              actually run the place on, fill it in once a week, and it lands
              in Monday&rsquo;s briefing with everything else. Start a timer on
              any task and find out what a week of that work really costs,
              before you quote the next one like it.
            </p>
            <p className="mt-group text-body text-faint">
              On both paid plans. Team and Studio share every feature, they
              differ only in how many of you there are.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
