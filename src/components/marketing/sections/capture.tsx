/**
 * "Getting work in": the voice capture moment, staged as an auto-playing
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
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        <div className="grid items-center gap-group md:grid-cols-2 md:gap-14">
          {/* Demo collage: listen, extract, confirm. Decorative throughout. */}
          <InView className="order-2 md:order-1">
            <Parallax speed={0.05}>
              <div aria-hidden className="relative">
                <div className="grad-card rounded-card border border-dashed border-line-strong bg-surface p-5 shadow-e2">
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
                    className="mt-item"
                    startDelay={300}
                    step={500}
                    lines={[
                      "“Naledi to send the Karoo Coffee report by Friday,",
                      "then homepage concepts for Sable next week Tuesday”",
                    ]}
                    lineClassName="text-dense italic text-muted"
                  />

                  {/* 3. Extracted proposals, shown before anything exists */}
                  <div className="mt-item space-y-sibling">
                    <div
                      className="anim anim-rise rounded-control border border-line bg-surface p-3"
                      style={{ animationDelay: "1500ms" }}
                    >
                      <p className="text-body font-medium">
                        Send the Karoo Coffee report
                      </p>
                      <div className="mt-sibling flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "#5B7C99" }}
                          />
                          <span className="text-micro text-muted">
                            Karoo Coffee retainer
                          </span>
                        </span>
                        <span
                          className="flex size-5 items-center justify-center rounded-full text-micro font-semibold text-white"
                          style={{ backgroundColor: "#7A9BD1" }}
                        >
                          N
                        </span>
                        <span className="text-micro text-muted">Friday</span>
                      </div>
                    </div>
                    <div
                      className="anim anim-rise rounded-control border border-line bg-surface p-3"
                      style={{ animationDelay: "1750ms" }}
                    >
                      <p className="text-body font-medium">Homepage concepts</p>
                      <div className="mt-sibling flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: "#B48EAD" }}
                          />
                          <span className="text-micro text-muted">
                            Sable rebrand
                          </span>
                        </span>
                        <span className="rounded-full border border-dashed border-line-strong px-2 py-0.5 text-micro text-faint">
                          Unassigned
                        </span>
                        <span className="text-micro text-muted">
                          Tue 21 Jul
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. The human presses confirm, never the AI */}
                  <div className="mt-item flex justify-end">
                    <span
                      className="anim anim-pop inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-body font-semibold text-on-accent"
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
                  <span className="anim-bob flex items-center gap-tight rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2">
                    <span className="size-1.5 rounded-full bg-accent" />
                    Nothing created without you
                  </span>
                </div>
              </div>
            </Parallax>
          </InView>

          {/* Copy */}
          <Reveal className="order-1 md:order-2">
            <p className="section-head">Getting work in</p>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              Hold the mic. Talk for ninety seconds. Confirm.
            </h2>
            <p className="mt-item max-w-prose text-lede text-muted">
              Walk out of a client call and just talk. Alpha pulls the tasks
              out of what you said, with the person, the project and the day
              already attached, and shows you the list before one of them
              exists. Or skip the mic and type{" "}
              <span className="rounded-chip border border-dashed border-line bg-raised px-1.5 py-0.5 text-dense text-ink">
                homepage concepts for Sable, Thabo, Friday
              </span>{" "}
              then enter.
            </p>
            <p className="mt-group text-body text-faint">
              The AI proposes. You are the one who creates.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
