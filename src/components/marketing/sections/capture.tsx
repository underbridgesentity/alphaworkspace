/**
 * Marketing section: the voice capture moment, staged as an auto-playing
 * product fragment. The mic listens (waveform), the spoken brief types out,
 * two task proposals rise in, and the confirm button pops, mirroring the
 * real extract, show, confirm flow. All motion uses the shared anim
 * utilities gated by <InView>, so it starts when the audience arrives and
 * collapses under prefers-reduced-motion. Dark band (section-invert).
 */
import { Check, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { Blob } from "@/components/marketing/blob";
import { InView } from "@/components/marketing/in-view";
import { Parallax } from "@/components/marketing/parallax";
import { Reveal } from "@/components/marketing/reveal";
import { TypeLines } from "@/components/marketing/type-lines";

/** Waveform silhouette: seven bars, symmetric heights, 90ms stagger. */
const WAVE_BARS = [
  { height: "h-2", delay: 0 },
  { height: "h-4", delay: 90 },
  { height: "h-3", delay: 180 },
  { height: "h-5", delay: 270 },
  { height: "h-3", delay: 360 },
  { height: "h-4", delay: 450 },
  { height: "h-2", delay: 540 },
];

export function Capture() {
  return (
    <section className="section-invert relative overflow-hidden border-y border-dashed border-line bg-bg text-ink">
      <Blob
        className="right-[-10%] top-[-24%] h-[22rem] w-[26rem]"
        morph={24}
        drift={38}
        strength={0.06}
      />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          {/* Demo collage: listen, extract, confirm. Decorative throughout. */}
          <InView className="order-2 md:order-1">
            <Parallax speed={0.05}>
              <div aria-hidden className="relative">
                <div className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-5 shadow">
                  {/* 1. Mic + live waveform */}
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                      <Mic className="size-4" />
                    </span>
                    <span className="flex items-center gap-1">
                      {WAVE_BARS.map((bar, i) => (
                        <span
                          key={i}
                          className={cn(
                            "anim-wave w-1 rounded bg-accent",
                            bar.height,
                          )}
                          style={{ animationDelay: `${bar.delay}ms` }}
                        />
                      ))}
                    </span>
                  </div>

                  {/* 2. The spoken brief, appearing line by line */}
                  <TypeLines
                    className="mt-4"
                    startDelay={300}
                    step={500}
                    lines={[
                      "“Naledi to send the Vodacom report by Friday,",
                      "then homepage concepts for Liberty next week Tuesday”",
                    ]}
                    lineClassName="text-sm italic text-muted"
                  />

                  {/* 3. Extracted proposals, shown before anything exists */}
                  <div className="mt-4 space-y-2">
                    <div
                      className="anim anim-rise rounded-control border border-line bg-surface p-3"
                      style={{ animationDelay: "1500ms" }}
                    >
                      <p className="text-sm font-medium">
                        Send the Vodacom report
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "#5B7C99" }}
                          />
                          <span className="text-[11px] text-muted">
                            Vodacom retainer
                          </span>
                        </span>
                        <span
                          className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: "#7A9BD1" }}
                        >
                          N
                        </span>
                        <span className="text-[11px] text-muted">Friday</span>
                      </div>
                    </div>
                    <div
                      className="anim anim-rise rounded-control border border-line bg-surface p-3"
                      style={{ animationDelay: "1750ms" }}
                    >
                      <p className="text-sm font-medium">Homepage concepts</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "#B48EAD" }}
                          />
                          <span className="text-[11px] text-muted">
                            Liberty rebrand
                          </span>
                        </span>
                        <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] text-faint">
                          Unassigned
                        </span>
                        <span className="text-[11px] text-muted">
                          Tue 21 Jul
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. The human presses confirm, never the AI */}
                  <div className="mt-4 flex justify-end">
                    <span
                      className="anim anim-pop inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent"
                      style={{ animationDelay: "2300ms" }}
                    >
                      <Check className="size-4" /> Create 2 tasks
                    </span>
                  </div>
                </div>

                {/* 5. Floating status chip */}
                <div
                  className="anim anim-pop absolute -right-2 -top-3 sm:-right-3"
                  style={{ animationDelay: "2800ms" }}
                >
                  <span className="anim-bob flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Nothing created without you
                  </span>
                </div>
              </div>
            </Parallax>
          </InView>

          {/* Copy */}
          <Reveal className="order-1 md:order-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              Capturing work costs nothing
            </p>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Hold the mic. Talk for ninety seconds. Confirm.
            </h2>
            <p className="mt-3 max-w-prose text-muted">
              Walk out of a client call and speak everything that needs doing,
              people, projects, days. Alpha extracts the tasks and shows you
              the list before anything is created. Or type{" "}
              <span className="rounded border border-dashed border-line bg-raised px-1.5 py-0.5 text-sm text-ink">
                homepage concepts for Liberty, Thabo, Friday
              </span>{" "}
              and press enter. The AI proposes; you always confirm.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
