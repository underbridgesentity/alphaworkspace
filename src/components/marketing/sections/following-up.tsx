/**
 * "The following up": the page's centre of gravity, sitting directly under
 * the hero because it is the thing the hero just promised.
 *
 * It replaces two older sections (a generic kanban show and a separate
 * nudges/offline pair). The kanban went because every competitor has one and
 * a board proves nothing about following up. What proves it is the product's
 * own signature: the FOLLOW-UP RAIL (globals.css, signature 1). Read the
 * strip of colour down the left of My Work and you know what needs chasing
 * before you read a word, then read the column beside it and you see the
 * chase already sent. Cause on the left, effect on the right, no prose in
 * between.
 *
 * Choreography (shared .anim vocabulary, gated by <InView>, staggered
 * inline). Rows rise first so the rail column paints as a single gesture,
 * then the nudges slide in one at a time, then the chip lands:
 *   120ms+  work rows rise, 110ms apart
 *   900ms+  nudges slide in from the right, 520ms apart
 *  2600ms   "You sent none of these" chip pops on the frame edge
 * The offline strip below runs its own <InView>, so it plays when it is
 * actually reached rather than finishing off-screen.
 */
import { AtSign, Bell, Check, Sparkles, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";

/**
 * A morning's worth of My Work. `rail` is the whole point: crimson overdue,
 * gold needs-a-decision-today, teal moving, grey idle, and completion is the
 * rail fading to nothing.
 */
const WORK: Array<{
  title: string;
  who: string;
  state: string;
  rail: string;
  stateClass?: string;
  done?: boolean;
  delay: number;
}> = [
  {
    title: "Send the Karoo Coffee report",
    who: "Naledi",
    state: "Overdue 2 days",
    rail: "rail-overdue",
    stateClass: "text-danger",
    delay: 120,
  },
  {
    title: "Sable homepage concepts",
    who: "Thabo",
    state: "Quiet 6 days",
    rail: "rail-today",
    stateClass: "text-warn",
    delay: 230,
  },
  {
    title: "Label copy, second round",
    who: "Naledi",
    state: "Due today",
    rail: "rail-today",
    stateClass: "text-warn",
    delay: 340,
  },
  {
    title: "Moodboard for Sable",
    who: "Thabo",
    state: "In progress",
    rail: "rail-active",
    delay: 450,
  },
  {
    title: "June invoices",
    who: "Sam",
    state: "Done Tuesday",
    rail: "rail-done",
    done: true,
    delay: 560,
  },
];

/** Each nudge answers a rail above it, in the order you read them. */
const NUDGES: Array<{
  icon: typeof Bell;
  accent?: boolean;
  title: string;
  body: string;
  delay: number;
}> = [
  {
    icon: Bell,
    title: "To Naledi, 06:30",
    body: "The Karoo Coffee report was due Friday. Still yours?",
    delay: 900,
  },
  {
    icon: AtSign,
    title: "To Thabo, 06:30",
    body: "Sable has not moved in 6 days.",
    delay: 1420,
  },
  {
    icon: Sparkles,
    accent: true,
    title: "To you, 06:30",
    body: "2 overdue, 1 due today, 1 project gone quiet.",
    delay: 1940,
  },
];

const QUEUED: Array<{ title: string; delay: number }> = [
  { title: "Draft Karoo Coffee status update", delay: 300 },
  { title: "Sable rebrand moodboard", delay: 480 },
  { title: "Karoo Coffee label copy", delay: 660 },
];

export function FollowingUp() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="streak right-[-8%] top-[18%]" />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-chapter md:px-8 md:py-24">
        {/* ------------------------------ header ------------------------------ */}
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="section-head">The following up</p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-group text-balance text-display-sm sm:text-display">
              You stop being the person who chases.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-item text-pretty text-lede text-muted">
              Alpha reads the board every morning. Overdue, due today, gone
              quiet: each one becomes a nudge to whoever owns it. The Thursday
              afternoon &ldquo;any update?&rdquo; round stops happening.
            </p>
          </Reveal>
        </div>

        {/* ------------------- the rail, and what it sends -------------------- */}
        <InView className="relative mt-section md:mt-chapter">
          <div
            aria-hidden
            className="overflow-hidden rounded-card border border-line bg-surface shadow-e3"
          >
            {/* app chrome */}
            <div className="flex items-center gap-3 border-b border-line px-item py-3">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-raised" />
                <span className="size-2.5 rounded-full bg-raised" />
                <span className="size-2.5 rounded-full bg-raised" />
              </div>
              <span className="text-micro text-faint">
                alpha · My Work · Monday
              </span>
            </div>

            {/* min-w-0 on both tracks, not decoration: a grid item's automatic
                minimum size is its MIN-CONTENT, and `truncate` is white-space:
                nowrap, so one long task title sizes the whole track to the full
                untruncated string and pushes the frame past a 360px screen.
                min-w-0 hands the clamping back to truncate, where it belongs. */}
            <div className="grid gap-group p-item sm:p-6 md:grid-cols-[1fr_0.85fr] md:gap-8">
              {/* left: the rail does the reading for you */}
              <div className="min-w-0">
                <h3 className="section-head">What needs chasing</h3>
                <div className="mt-item space-y-sibling">
                  {WORK.map((row) => (
                    <div
                      key={row.title}
                      className={cn(
                        "anim anim-rise rail flex items-center gap-3 rounded-control border border-line bg-raised/60 py-snug pl-item pr-3",
                        row.rail,
                      )}
                      style={{ animationDelay: `${row.delay}ms` }}
                    >
                      {row.done ? (
                        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-accent">
                          <Check
                            className="size-2.5 text-on-accent"
                            strokeWidth={3}
                          />
                        </span>
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border-2 border-line-strong" />
                      )}
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate text-body font-medium",
                          row.done && "text-faint line-through",
                        )}
                      >
                        {row.title}
                      </p>
                      <span className="shrink-0 text-micro text-faint">
                        {row.who}
                      </span>
                      <span
                        className={cn(
                          "hidden w-24 shrink-0 text-right text-micro sm:block",
                          row.stateClass ?? "text-faint",
                        )}
                      >
                        {row.state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* right: what went out, without anyone typing it */}
              <div className="min-w-0 md:border-l md:border-line md:pl-8">
                <h3 className="section-head">What Alpha sent</h3>
                <div className="mt-item space-y-sibling">
                  {NUDGES.map((nudge) => {
                    const Icon = nudge.icon;
                    return (
                      <div
                        key={nudge.title}
                        className="anim anim-slide-r flex items-start gap-3 rounded-control border border-line bg-raised/60 p-3"
                        style={{ animationDelay: `${nudge.delay}ms` }}
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full",
                            nudge.accent
                              ? "bg-accent-soft"
                              : "border border-line bg-surface",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4",
                              nudge.accent ? "text-accent" : "text-muted",
                            )}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-micro text-faint">{nudge.title}</p>
                          <p className="mt-hair text-dense">{nudge.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p
                  className="anim anim-rise mt-item text-meta text-faint"
                  style={{ animationDelay: "2400ms" }}
                >
                  One batched send per person per morning, in-app, push and
                  email. Never a storm.
                </p>
              </div>
            </div>
          </div>

          {/* the payoff, straddling the frame edge */}
          <div className="anim-bob absolute -top-3 right-4 sm:right-8">
            <div
              className="anim anim-pop flex w-max items-center gap-tight rounded-full border border-line bg-surface px-2.5 py-1 text-micro shadow-e2"
              style={{ animationDelay: "2600ms" }}
            >
              <span className="size-1.5 shrink-0 rounded-full bg-accent" />
              You sent none of these
            </div>
          </div>
        </InView>

        {/* ------------------- and it holds when signal drops ----------------- */}
        <div className="hairline-fade mt-section" />

        <InView className="mt-section grid items-center gap-group md:grid-cols-[0.9fr_1.1fr] md:gap-8">
          <div className="min-w-0">
            <h3 className="section-head">When the line drops</h3>
            <p className="anim anim-rise mt-item text-body text-muted">
              Load shedding, a dead tower, a basement at a client&rsquo;s
              office. Reads come from cache, writes queue on the phone, and
              everything lands the moment signal returns. Nobody re-types a
              task.
            </p>
          </div>

          <div
            aria-hidden
            className="min-w-0 rounded-card border border-line bg-surface p-item shadow-e2"
          >
            <div
              className="anim anim-rise flex items-center gap-3"
              style={{ animationDelay: "120ms" }}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised">
                <WifiOff className="size-4 text-muted" />
              </span>
              <p className="text-body font-medium">Connection dropped</p>
              <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-micro text-muted">
                offline
              </span>
            </div>
            <div className="mt-item space-y-sibling">
              {QUEUED.map((row) => (
                <div
                  key={row.title}
                  className="anim anim-rise flex items-center gap-2.5 rounded-control border border-line bg-raised/60 px-3 py-2.5"
                  style={{ animationDelay: `${row.delay}ms` }}
                >
                  <span className="size-3.5 shrink-0 rounded-full border-2 border-line-strong" />
                  <p className="min-w-0 flex-1 truncate text-dense font-medium">
                    {row.title}
                  </p>
                  <span className="shrink-0 rounded-full border border-dashed border-line px-2 py-0.5 text-micro text-faint">
                    queued
                  </span>
                </div>
              ))}
            </div>
            <div
              className="anim anim-rise relative mt-sibling flex h-8 items-center overflow-hidden rounded-control bg-raised px-3 text-meta text-muted"
              style={{ animationDelay: "1000ms" }}
            >
              <span className="relative">Back online · syncing 3 changes</span>
              <span
                className="anim-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent-soft to-transparent"
                style={{ animationDelay: "1.4s" }}
              />
            </div>
          </div>
        </InView>
      </div>
    </section>
  );
}
