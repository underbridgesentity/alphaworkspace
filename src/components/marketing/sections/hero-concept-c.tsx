import type { CSSProperties } from "react";
import Link from "next/link";
import { InView } from "@/components/marketing/in-view";

/* ---------------------------------------------------------------------------
 * HERO CONCEPT C: "One day, two columns."
 *
 * The visual is not a product screenshot and not a collage. It is a ledger of
 * a single working Wednesday, drawn against one shared vertical time axis.
 *
 *   LEFT of the axis   every message a human sent to find out one thing.
 *                      Fourteen grey strokes, ragged lengths, bunched into
 *                      three anxious bursts, ending in an open ring: no answer.
 *   RIGHT of the axis  what the workspace did, unasked. Three even teal marks,
 *                      the first of them landing before anyone had to ask,
 *                      the last one closing the day.
 *
 * The argument is carried by DENSITY, not by tone. Nothing on the noisy side is
 * red or alarming, it is just cluttered, which is the honest feeling. The relief
 * side is mostly empty space, because empty space is the product.
 *
 * Grammar rules the composition keeps:
 *   - zero boxes. No card, no border-radius container, no shadow, no tilt.
 *     Rules, marks, small caps and two numerals. A ledger page, per the design
 *     system's own name.
 *   - teal appears ONLY on the handled side. That is the whole point of an
 *     accent: it means one thing here.
 *   - the two footer numerals sit on the system's ledger-line signature, one
 *     track full, one track empty.
 * ------------------------------------------------------------------------- */

/* The visible day, 05:30 to 18:30, so the earliest and latest marks have air
 * above and below them instead of clipping the axis. */
const DAY_START = 5 * 60 + 30;
const DAY_END = 18 * 60 + 30;

function atPercent(minuteOfDay: number): number {
  return ((minuteOfDay - DAY_START) / (DAY_END - DAY_START)) * 100;
}

/** Custom-property styles: React.CSSProperties has no index signature. */
function vars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

/* Fourteen messages chasing one answer. `len` is the stroke length as a share
 * of the half column, so longer message, longer mark. The rhythm is the story:
 * three clusters of two or three minutes apart, separated by an hour of
 * silence, which is exactly what a chase looks like when you plot it. */
const CHASE: Array<{ minute: number; len: number }> = [
  { minute: 8 * 60 + 12, len: 72 },
  { minute: 8 * 60 + 32, len: 44 },
  { minute: 8 * 60 + 55, len: 88 },
  { minute: 10 * 60 + 5, len: 36 },
  { minute: 10 * 60 + 28, len: 66 },
  { minute: 11 * 60 + 30, len: 52 },
  { minute: 11 * 60 + 52, len: 80 },
  { minute: 12 * 60 + 15, len: 30 },
  { minute: 13 * 60 + 20, len: 60 },
  { minute: 14 * 60 + 22, len: 46 },
  { minute: 14 * 60 + 45, len: 84 },
  { minute: 15 * 60 + 50, len: 38 },
  { minute: 16 * 60 + 12, len: 58 },
  { minute: 16 * 60 + 35, len: 26 },
];

/* Three things the workspace did without being asked. */
const HANDLED: Array<{ minute: number; time: string; label: string }> = [
  { minute: 6 * 60 + 31, time: "06:31", label: "Morning brief" },
  { minute: 11 * 60 + 4, time: "11:04", label: "Voice note, 2 tasks" },
  { minute: 16 * 60 + 58, time: "16:58", label: "Report sent" },
];

/* Choreography. Delay is proportional to the time of day, so the show replays
 * the day at 65x: the teal 06:31 mark lands alone and early, the grey burst
 * accumulates through the middle, and the final beat is the teal dot closing
 * the day AFTER the chase has given up. The ordering is the argument, which is
 * the only reason any of this moves. */
const chaseDelay = (percent: number) => Math.round(240 + percent * 15);
const handledDelay = (percent: number) => Math.round(100 + percent * 16.5);

/* The last message of the day, the one that never got a reply. */
const UNANSWERED_AT = 16 * 60 + 35;

const STAGE_CSS = `
.hc-stage .hc-mark {
  animation-duration: 0.42s;
  animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
  animation-fill-mode: both;
  animation-play-state: paused;
}
[data-inview] .hc-stage .hc-mark { animation-play-state: running; }
.hc-stage .hc-grow-l { animation-name: hc-grow; transform-origin: right center; }
.hc-stage .hc-grow-r { animation-name: hc-grow; transform-origin: left center; }
.hc-stage .hc-node { animation-name: hc-node; }
.hc-stage .hc-fade { animation-name: hc-fade; }
@keyframes hc-grow {
  from { opacity: 0; transform: scaleX(0.05); }
  to { opacity: 1; transform: none; }
}
@keyframes hc-node {
  from { opacity: 0; transform: scale(0.3); }
  to { opacity: 1; transform: none; }
}
@keyframes hc-fade {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .hc-stage .hc-mark {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
`;

function DayLedger() {
  return (
    <figure className="hc-stage relative mx-auto w-full max-w-[26rem]">
      <figcaption className="text-balance text-center text-meta text-muted">
        One Wednesday. One question: did the Sable deck go out?
      </figcaption>

      <div className="mt-5 grid grid-cols-2">
        <p className="section-head pr-3 text-right">The group chat</p>
        <p className="section-head pl-3">Alpha Workspace</p>
      </div>
      <div aria-hidden className="hairline-fade mt-2" />

      <div className="relative mt-1 h-[18.5rem] sm:h-[21rem]">
        {/* The day itself. Gradient on a background, fading at both ends so the
            axis reads as a span of time rather than a drawn border. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--line-strong) 7%, var(--line-strong) 93%, transparent)",
          }}
        />

        {/* ---------------------------- the chase --------------------------- */}
        <div aria-hidden className="absolute inset-y-0 left-0 right-1/2">
          {CHASE.map((mark) => {
            const top = atPercent(mark.minute);
            return (
              <div
                key={mark.minute}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: `${top}%`, width: `${mark.len}%` }}
              >
                <span
                  className="hc-mark hc-grow-l block h-[2px] w-full rounded-full bg-faint"
                  style={{ animationDelay: `${chaseDelay(top)}ms` }}
                />
              </div>
            );
          })}

          {/* Still open at 16:35. The one mark on this side that touches the
              axis, because it is the only one anybody is still waiting on. */}
          <div
            className="absolute right-0 -translate-y-1/2 translate-x-1/2"
            style={{ top: `${atPercent(UNANSWERED_AT)}%` }}
          >
            <span
              className="hc-mark hc-node block size-[10px] rounded-full border-[1.5px] border-faint bg-bg"
              style={{
                animationDelay: `${chaseDelay(atPercent(UNANSWERED_AT)) + 60}ms`,
              }}
            />
          </div>
        </div>

        {/* --------------------------- what happened ------------------------ */}
        <div className="absolute inset-y-0 left-1/2 right-0">
          {HANDLED.map((event, i) => {
            const top = atPercent(event.minute);
            const delay = handledDelay(top);
            const closing = i === HANDLED.length - 1;
            return (
              <div
                key={event.minute}
                className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2.5"
                style={{ top: `${top}%` }}
              >
                <span
                  aria-hidden
                  className="hc-mark hc-node -ml-1 block size-2 shrink-0 rounded-full bg-accent"
                  style={
                    closing
                      ? {
                          animationDelay: `${delay}ms`,
                          boxShadow: "0 0 0 4px var(--accent-soft)",
                        }
                      : { animationDelay: `${delay}ms` }
                  }
                />
                <span
                  aria-hidden
                  className="hc-mark hc-grow-r block h-[2px] w-3.5 shrink-0 rounded-full bg-accent sm:w-4"
                  style={{ animationDelay: `${delay + 40}ms` }}
                />
                <span
                  className="hc-mark hc-fade block min-w-0"
                  style={{ animationDelay: `${delay + 90}ms` }}
                >
                  <span className="num block text-micro text-faint">
                    {event.time}
                  </span>
                  <span className="block text-dense text-ink">
                    {event.label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div aria-hidden className="hairline-fade mt-1" />

      <div className="mt-4 grid grid-cols-2 items-start">
        <div className="pr-3 text-right">
          <p className="num-hero ledger text-muted">
            14
            <span className="ledger-track">
              <span
                className="ledger-fill"
                style={vars({ "--fill": 1, "--ledger-tone": "var(--muted)" })}
              />
            </span>
          </p>
          <p className="mt-1.5 text-micro text-faint">messages, no answer</p>
        </div>
        <div className="pl-3">
          <p className="num-hero ledger text-accent-quiet">
            0
            <span className="ledger-track">
              <span className="ledger-fill" style={vars({ "--fill": 0 })} />
            </span>
          </p>
          <p className="mt-1.5 text-micro text-faint">
            messages you had to send
          </p>
        </div>
      </div>
    </figure>
  );
}

export function HeroConceptC() {
  return (
    <section className="relative overflow-hidden">
      {/* React 19 hoists this into <head> and dedupes it by href, so the rules
          exist once no matter how many times the hero renders. */}
      <style
        href="hero-concept-c"
        precedence="medium"
        dangerouslySetInnerHTML={{ __html: STAGE_CSS }}
      />

      {/* Static wash, no animation: depth without a moving part. A gradient on
          a background is the only place a gradient is allowed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-14%] top-[6%] hidden h-[34rem] w-[34rem] md:block"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--accent) 8%, transparent), transparent 72%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <InView className="grid items-center gap-12 md:grid-cols-[52fr_48fr] md:gap-10">
          {/* ------------------------------ copy ---------------------------- */}
          <div>
            <p className="anim anim-rise w-fit rounded-full border border-dashed border-line-strong px-3.5 py-1 text-meta font-medium text-muted">
              For South African teams of 2–15 people
            </p>
            <h1
              className="anim anim-rise mt-6 text-balance text-display-lg sm:text-[3.75rem]"
              style={{ animationDelay: "80ms" }}
            >
              The workspace that does the following up.
            </h1>
            <p
              className="anim anim-rise mt-5 max-w-md text-pretty text-lede text-muted"
              style={{ animationDelay: "160ms" }}
            >
              Alpha Workspace chases the updates so your team does not have to.
              Work captures itself, the status report writes itself, and it all
              keeps moving when the signal drops. One price for the whole team,
              in rand.
            </p>
            <div
              className="anim anim-rise mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/sign-in"
                className="press rounded-control bg-accent px-6 py-3 text-center font-semibold text-on-accent hover:bg-accent-hover"
              >
                Start free, no card
              </Link>
              <Link
                href="/pricing"
                className="press rounded-control border border-dashed border-line-strong px-6 py-3 text-center font-medium text-ink transition-colors hover:bg-sunken"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* ----------------------------- the ledger ----------------------- */}
          <div
            className="anim anim-rise"
            style={{ animationDelay: "120ms" }}
          >
            <DayLedger />
          </div>
        </InView>
      </div>
    </section>
  );
}
