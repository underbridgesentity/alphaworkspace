/**
 * BoardShow: the auto-playing product frame. A calm kanban fragment where one
 * task ("Karoo Coffee review") visibly travels To do -> In progress -> Done
 * on scroll-into-view, with no JS beyond the shared <InView> gate.
 *
 * Choreography (all one-shot .anim classes, staggered with inline delays):
 *   200ms  card pops into To do
 *  1700ms  To do twin reverse-pops away (dimmed base stays), card pops into
 *          In progress
 *  3200ms  In progress twin reverse-pops away, card pops into Done with the
 *          teal check
 *  3800ms  "Done · celebrated" chip pops on the Done card
 *  4200ms  "Nobody chased this" chip pops on the frame edge and bobs
 *
 * Each travelling column stacks two copies: a base dimmed to 40% (kept in
 * flow so nothing shifts) under a full-opacity twin. Both pop in together;
 * the twin later plays anim-pop in reverse (fill forwards) so it fades and
 * recedes, revealing the dimmed base: reads as the task leaving the column.
 * Under prefers-reduced-motion the whole thing collapses to a still
 * storyboard of the task at all three stages.
 */
import {
  BarChart3,
  Check,
  FolderKanban,
  Home,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { InView } from "@/components/marketing/in-view";
import { Reveal } from "@/components/marketing/reveal";

type CardState = "todo" | "doing" | "done";

function StatusDot({ state }: { state: CardState }) {
  if (state === "done") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-accent">
        <Check className="size-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "size-3.5 shrink-0 rounded-full border-2",
        state === "doing" ? "border-accent" : "border-line-strong",
      )}
    />
  );
}

function Avatar({ initial, colour }: { initial: string; colour: string }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
      style={{ backgroundColor: colour }}
    >
      {initial}
    </span>
  );
}

function FloatChip({ label }: { label: string }) {
  return (
    <span className="flex w-max items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow">
      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
      {label}
    </span>
  );
}

function TaskCard({
  title,
  state,
  project,
  projectColour,
  initial,
  avatarColour,
  due,
}: {
  title: string;
  state: CardState;
  project: string;
  projectColour: string;
  initial: string;
  avatarColour: string;
  due?: string;
}) {
  return (
    <div className="rounded-control border border-line bg-surface p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <StatusDot state={state} />
        </span>
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            state === "done" && "text-faint line-through",
          )}
        >
          {title}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: projectColour }}
          />
          <span className="text-[11px] text-muted">{project}</span>
        </span>
        {due ? <span className="text-[11px] text-muted">{due}</span> : null}
        <span className="ml-auto">
          <Avatar initial={initial} colour={avatarColour} />
        </span>
      </div>
    </div>
  );
}

/** The travelling task, identical in every column bar its status dot. */
function KarooCard({ state }: { state: CardState }) {
  return (
    <TaskCard
      title="Karoo Coffee review"
      state={state}
      project="Karoo Coffee"
      projectColour="#6FAE87"
      initial="L"
      avatarColour="#B48EAD"
    />
  );
}

/**
 * One column's slot for the travelling card. With `leaveAt`, a dimmed base
 * sits under a full-opacity twin: both pop in at `enterAt`; at `leaveAt` the
 * twin plays anim-pop in reverse and holds hidden, leaving the 40% ghost.
 * Without `leaveAt` (the Done column) the card simply pops in and stays.
 */
function MoveSlot({
  state,
  enterAt,
  leaveAt,
}: {
  state: CardState;
  enterAt: number;
  leaveAt?: number;
}) {
  if (leaveAt === undefined) {
    return (
      <div className="anim anim-pop" style={{ animationDelay: `${enterAt}ms` }}>
        <KarooCard state={state} />
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="anim anim-pop" style={{ animationDelay: `${enterAt}ms` }}>
        <div className="opacity-40">
          <KarooCard state={state} />
        </div>
      </div>
      <div
        className="anim anim-pop absolute inset-0"
        style={{ animationDelay: `${enterAt}ms` }}
      >
        <div
          className="anim anim-pop"
          style={{
            animationDelay: `${leaveAt}ms`,
            animationDirection: "reverse",
            animationFillMode: "forwards",
          }}
        >
          <KarooCard state={state} />
        </div>
      </div>
    </div>
  );
}

function Column({
  state,
  name,
  count,
  children,
}: {
  state: CardState;
  name: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1">
        <StatusDot state={state} />
        <span className="text-xs font-semibold text-muted">{name}</span>
        <span className="ml-auto rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-medium text-faint">
          {count}
        </span>
      </div>
      <div className="mt-2 min-h-44 space-y-2 rounded-control bg-raised/60 p-2">
        {children}
      </div>
    </div>
  );
}

export function BoardShow() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="streak right-[-8%] top-[20%]" />
      <div className="relative mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="text-center">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">
              Work you can watch move
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Tasks cost nothing to create. Or to finish.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
              Type a line, speak a voice note, forward a thought. It lands on
              the board as a task with an owner and a day, and the board keeps
              itself honest.
            </p>
          </Reveal>
        </div>

        <InView className="mt-10">
          <div aria-hidden className="relative">
            <div className="overflow-hidden rounded-card border border-line bg-surface shadow-[var(--shadow-overlay)]">
              {/* chrome bar */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-raised" />
                  <span className="size-2.5 rounded-full bg-raised" />
                  <span className="size-2.5 rounded-full bg-raised" />
                </div>
                <span className="text-xs text-faint">
                  alpha · Karoo Coffee retainer
                </span>
              </div>

              <div className="flex">
                {/* slim sidebar */}
                <div className="hidden w-10 flex-col items-center gap-3 border-r border-line py-4 sm:flex">
                  <Home className="size-4 text-faint" />
                  <FolderKanban className="size-4 text-faint" />
                  <Inbox className="size-4 text-faint" />
                  <BarChart3 className="size-4 text-faint" />
                </div>

                {/* board: swipeable inside the frame on phones (columns keep
                    a readable width), a plain 3-up grid from sm. */}
                <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto p-4 [&>*]:w-44 [&>*]:shrink-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:p-6 sm:[&>*]:w-auto">
                  <Column state="todo" name="To do" count={2}>
                    <TaskCard
                      title="Retainer report deck"
                      state="todo"
                      project="Karoo Coffee retainer"
                      projectColour="#5B7C99"
                      initial="T"
                      avatarColour="#5B7C99"
                      due="Due Fri"
                    />
                    <MoveSlot state="todo" enterAt={200} leaveAt={1700} />
                  </Column>

                  <Column state="doing" name="In progress" count={2}>
                    <TaskCard
                      title="Homepage concepts"
                      state="doing"
                      project="Sable rebrand"
                      projectColour="#B48EAD"
                      initial="N"
                      avatarColour="#7A9BD1"
                    />
                    <MoveSlot state="doing" enterAt={1700} leaveAt={3200} />
                  </Column>

                  <Column state="done" name="Done" count={2}>
                    <TaskCard
                      title="June invoices"
                      state="done"
                      project="Karoo Coffee retainer"
                      projectColour="#5B7C99"
                      initial="S"
                      avatarColour="#6FAE87"
                    />
                    <div className="relative">
                      <MoveSlot state="done" enterAt={3200} />
                      <div className="absolute -top-3 right-0">
                        <div
                          className="anim anim-pop"
                          style={{ animationDelay: "3800ms" }}
                        >
                          <FloatChip label="Done · celebrated" />
                        </div>
                      </div>
                    </div>
                  </Column>
                </div>
              </div>
            </div>

            {/* floating status chip straddling the frame's top-right edge */}
            <div className="anim-bob absolute -top-3 right-4 sm:right-8">
              <div
                className="anim anim-pop"
                style={{ animationDelay: "4200ms" }}
              >
                <FloatChip label="Nobody chased this" />
              </div>
            </div>
          </div>
        </InView>
      </div>
    </section>
  );
}
