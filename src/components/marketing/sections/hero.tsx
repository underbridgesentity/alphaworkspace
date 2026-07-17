import Link from "next/link";
import { Mic, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";
import { Parallax } from "@/components/marketing/parallax";
import { TypeLines } from "@/components/marketing/type-lines";

/* Demo palette: avatar circles + project dots (the only sanctioned hexes). */
const PEOPLE = {
  naledi: "#6FAE87",
  thabo: "#7A9BD1",
} as const;
const PROJECTS = {
  vodacom: "#5B7C99",
  liberty: "#B48EAD",
} as const;

const WAVE_BARS = [
  { height: "h-3", delay: "0ms" },
  { height: "h-5", delay: "120ms" },
  { height: "h-6", delay: "240ms" },
  { height: "h-4", delay: "360ms" },
  { height: "h-3", delay: "480ms" },
];

/* Last five solid: the streak the caption talks about. */
const MOMENTUM_BLOCKS = [
  "bg-accent/30",
  "bg-accent/55",
  "bg-accent/55",
  "bg-accent",
  "bg-accent",
  "bg-accent",
  "bg-accent",
  "bg-accent",
];

const AUDIENCES = [
  "Agencies",
  "Design studios",
  "Dev shops",
  "Ops teams",
  "Consultancies",
  "Marketing teams",
  "Accounting firms",
  "NPOs",
];

function MiniTask({
  title,
  project,
  dot,
  initial,
  avatar,
  due,
}: {
  title: string;
  project: string;
  dot: string;
  initial: string;
  avatar: string;
  due?: string;
}) {
  return (
    <div className="rounded-control border border-line bg-surface p-3">
      <p className="text-sm font-medium leading-snug text-ink">{title}</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {project}
        </span>
        {due ? (
          <span className="shrink-0 text-[11px] text-muted">{due}</span>
        ) : null}
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: avatar }}
        >
          {initial}
        </span>
      </div>
    </div>
  );
}

/* Monday-signature floating chip, in Alpha teal. Bob on the wrapper so the
 * pop (fill-mode both) and the idle float never fight over transform. */
function FloatChip({
  label,
  className,
  bobDelay,
  popDelay,
}: {
  label: string;
  className: string;
  bobDelay: string;
  popDelay: string;
}) {
  return (
    <div
      className={cn("anim-bob absolute z-30", className)}
      style={{ animationDelay: bobDelay }}
    >
      <div
        className="anim anim-pop flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink shadow"
        style={{ animationDelay: popDelay }}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        {label}
      </div>
    </div>
  );
}

function BeltRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden || undefined} className="flex gap-2 pr-2">
      {AUDIENCES.map((audience) => (
        <span
          key={audience}
          className="whitespace-nowrap rounded-full border border-line bg-surface/70 px-3.5 py-1.5 text-sm text-muted"
        >
          {audience}
        </span>
      ))}
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="streak left-[-10%] top-[30%]" />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <InView className="grid items-center gap-8 md:grid-cols-[55fr_45fr] md:gap-10">
          {/* ------------------------------ copy ------------------------------ */}
          <div>
            <p className="anim anim-rise w-fit rounded-full border border-dashed border-line-strong px-3.5 py-1 text-xs font-medium text-muted">
              For South African teams of 2–15 people
            </p>
            <h1
              className="anim anim-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              The workspace that does the following up.
            </h1>
            <p
              className="anim anim-rise mt-5 max-w-xl text-pretty text-lg text-muted"
              style={{ animationDelay: "160ms" }}
            >
              Alpha Workspace is the project and work-management app that
              follows up so your team doesn’t have to. Stop chasing status on
              WhatsApp and email: work captures itself, reports itself, and
              keeps moving even when the connection doesn’t, one flat price for
              the whole team, in rand.
            </p>
            <div
              className="anim anim-rise mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "240ms" }}
            >
              <Link
                href="/sign-in"
                className="press rounded-[0.625rem] bg-accent px-6 py-3 text-center font-semibold text-on-accent hover:bg-accent-hover"
              >
                Start free, no card
              </Link>
              <Link
                href="/pricing"
                className="press rounded-[0.625rem] border border-dashed border-line-strong px-6 py-3 text-center font-medium text-ink transition-colors hover:bg-raised"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* ---------------------- product collage --------------------------- */}
          <Parallax speed={0.06}>
            {/* Outer box owns the layout height (the VISUAL size); the canvas
                is absolute, so scaling it down on phones leaves no layout
                ghost below the collage. */}
            <div aria-hidden className="relative h-[358px] sm:h-[480px]">
            <div
              className="absolute inset-x-0 top-0 h-[420px] origin-top scale-[0.85] sm:h-[480px] sm:scale-100"
            >
              {/* Back: a slice of the board. */}
              <div
                className="anim anim-pop absolute left-0 top-0 w-56 rotate-[-2deg] rounded-card border border-line bg-raised/80 p-3 shadow-[var(--shadow-overlay)]"
                style={{ animationDelay: "150ms" }}
              >
                <div className="flex items-center gap-2">
                  <span className="size-3.5 shrink-0 rounded-full border-2 border-accent" />
                  <p className="text-xs font-semibold text-ink">In progress</p>
                  <span className="ml-auto text-[11px] font-medium text-faint">
                    2
                  </span>
                </div>
                <div className="mt-2.5 space-y-2">
                  <MiniTask
                    title="Homepage concepts"
                    project="Liberty rebrand"
                    dot={PROJECTS.liberty}
                    initial="N"
                    avatar={PEOPLE.naledi}
                  />
                  <MiniTask
                    title="Send the Vodacom report"
                    project="Vodacom retainer"
                    dot={PROJECTS.vodacom}
                    initial="T"
                    avatar={PEOPLE.thabo}
                    due="Friday"
                  />
                </div>
              </div>

              {/* Mid: the briefing that wrote itself. */}
              <div
                className="anim anim-pop grad-card absolute right-0 top-28 z-10 w-64 rotate-[1.5deg] rounded-card border border-line bg-surface p-4 shadow-[var(--shadow-overlay)]"
                style={{ animationDelay: "300ms" }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 shrink-0 text-accent" />
                  <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Monday 06:30 · Weekly briefing
                  </p>
                </div>
                <TypeLines
                  lines={[
                    "The team closed out 14 tasks against 11 new ones.",
                    "Liberty has had nothing move in 6 days; watch it.",
                  ]}
                  startDelay={650}
                  step={420}
                  className="mt-2.5 space-y-1.5"
                  lineClassName="text-xs leading-relaxed text-ink/85"
                />
              </div>

              {/* Front left: voice capture mid-flight. */}
              <div
                className="anim anim-pop absolute bottom-[108px] left-1 z-20 w-48 rotate-[3deg] rounded-card border border-line bg-surface p-3 shadow-[var(--shadow-overlay)]"
                style={{ animationDelay: "400ms" }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                    <Mic className="size-3.5" />
                  </span>
                  <span className="flex h-6 items-center gap-1">
                    {WAVE_BARS.map((bar, i) => (
                      <span
                        key={i}
                        className={cn(
                          "anim-wave w-1 rounded-full bg-accent",
                          bar.height,
                        )}
                        style={{ animationDelay: bar.delay }}
                      />
                    ))}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Naledi to send the report by Friday…
                </p>
              </div>

              {/* Front right: momentum, the habit loop. */}
              <div
                className="anim anim-pop grad-card absolute bottom-3 right-5 z-20 w-40 rotate-[-2deg] rounded-card border border-line bg-surface p-3 shadow-[var(--shadow-overlay)]"
                style={{ animationDelay: "450ms" }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Momentum
                </p>
                <div className="mt-2 flex justify-between">
                  {MOMENTUM_BLOCKS.map((block, i) => (
                    <span key={i} className={cn("size-4 rounded", block)} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">5 day streak</p>
              </div>

              <FloatChip
                label="2 tasks created from voice"
                className="bottom-[86px] left-24"
                bobDelay="-2.2s"
                popDelay="500ms"
              />
              <FloatChip
                label="Report wrote itself"
                className="right-2 top-24"
                bobDelay="-4.6s"
                popDelay="650ms"
              />
            </div>
            </div>
          </Parallax>
        </InView>

        {/* ---------------------- audience belt ------------------------------ */}
        <InView className="relative mt-10 overflow-hidden sm:mt-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent"
          />
          <div className="anim-marquee flex w-max">
            <BeltRow />
            <BeltRow hidden />
          </div>
        </InView>
      </div>
    </section>
  );
}
