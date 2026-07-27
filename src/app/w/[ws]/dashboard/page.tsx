"use client";

/**
 * The "it reports itself" surface: the Monday narrative front and centre,
 * zero-setup KPIs beneath it, then the Phase 2 layer (scorecards + time).
 * Visual language throughout: values live INSIDE the bars, labels sit
 * outside; day/period blocks carry intensity, never colour alone (numbers
 * are always present in text or tooltips).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useFeature, useWorkspace } from "@/lib/client/workspace";
import { planWithFeature, type Feature } from "@/lib/plans";
import { formatDay, formatMinutes, timeAgo } from "@/lib/dates";
import type {
  MemberPerformanceRow,
  ScorecardDTO,
  ScorecardUnit,
  WeekTimeDTO,
  WorkspaceKpis,
} from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";

interface NarrativeRow {
  id: string;
  weekStart: string;
  weekEnd: string;
  narrative: string;
  engine: string;
  createdAt: string;
}

interface DashboardData {
  kpis: WorkspaceKpis;
  people?: MemberPerformanceRow[];
  scorecards?: ScorecardDTO[];
  timeWeek?: WeekTimeDTO;
  narratives: NarrativeRow[];
}

/**
 * The one heading idiom, now the `section-head` utility in globals.css so that
 * every surface spells it identically. This rank used to be three near-misses
 * (text-sm font-semibold here, uppercase micro on My Work, 11px in the
 * sidebar), and text at body size is not a heading in the first place.
 */
const SECTION_HEAD = "section-head";

/** React's CSSProperties has no slot for custom properties, so name the shape
 *  once rather than casting at every call site. */
type StyleVars = React.CSSProperties & Record<`--${string}`, string | number>;
const styleVars = (v: StyleVars): StyleVars => v;

/**
 * THE LEDGER LINE. A 2px rule under a number, filled to that number's share of
 * its own context: completion against 100, work cleared against work that came
 * in, overdue against everything still open, a scorecard against its target.
 * `of` is null when there is no honest denominator, and then nothing is drawn,
 * because an empty rule reads as a measured zero.
 *
 * The fill rides scaleX from a left origin, so it never leaves the compositor,
 * and the global reduced-motion block collapses it straight to its final
 * state.
 */
function Ledger({
  value,
  of,
  tone,
}: {
  value: number;
  of: number | null;
  tone?: "danger" | "warn";
}) {
  const ratio =
    of !== null && of > 0 ? Math.min(1, Math.max(0, value / of)) : null;
  const fill = useRef<HTMLSpanElement>(null);

  // Written to the DOM rather than rendered. The first paint leaves --fill at
  // its CSS default of 0 and this write, one tick later, is what the transition
  // interpolates from; rendering the value would paint the rule already full.
  // It reruns only when the ratio itself changes, so the growth is an entry
  // animation, not a per-render effect.
  useEffect(() => {
    fill.current?.style.setProperty("--fill", String(ratio ?? 0));
  }, [ratio]);

  if (ratio === null) return null;
  return (
    <span className="ledger-track" aria-hidden="true">
      <span
        ref={fill}
        className="ledger-fill"
        style={
          tone ? styleVars({ "--ledger-tone": `var(--${tone})` }) : undefined
        }
      />
    </span>
  );
}

export default function DashboardPage() {
  const { workspace, projects } = useWorkspace();
  const [projectId, setProjectId] = useState<string | null>(null);
  // Per-person load and scorecards are a manager's view (see the API route).
  const isManager = workspace.role !== "member";

  const { data, isLoading } = useQuery({
    queryKey: ["ws", workspace.slug, "dashboard", projectId ?? "all"],
    queryFn: () =>
      apiGet<DashboardData>(
        `/api/w/${workspace.slug}/dashboard${projectId ? `?project=${projectId}` : ""}`,
      ),
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5 md:px-6 md:pt-7">
      <h1 className="text-display-sm">Pulse</h1>
      <p className="mt-tight text-body text-muted">
        Nobody compiled this. It’s all from the work itself.
      </p>

      {/* Scope chips */}
      <div className="mt-item flex flex-wrap items-center gap-1.5">
        <ScopeChip active={projectId === null} onClick={() => setProjectId(null)}>
          Whole workspace
        </ScopeChip>
        {projects.map((p) => (
          <ScopeChip
            key={p.id}
            active={projectId === p.id}
            onClick={() => setProjectId(p.id)}
            dot={p.color}
          >
            {p.name}
          </ScopeChip>
        ))}
      </div>

      {projectId === null && <NarrativeSection narratives={data?.narratives} />}

      {isLoading ? (
        <>
          <div className="mt-group grid gap-sibling sm:grid-cols-3">
            <div className="skeleton h-28 sm:col-span-2" />
            <div className="skeleton h-28" />
          </div>
          <div className="mt-sibling grid grid-cols-2 gap-sibling">
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        </>
      ) : data ? (
        <>
          <KpiBoard kpis={data.kpis} />
          <Momentum days={data.kpis.completionsByDay} />
          <div
            className={cn(
              "mt-4 grid gap-4",
              isManager && "md:grid-cols-2",
            )}
          >
            <ThroughputChart weeks={data.kpis.throughputByWeek} />
            {isManager && <MemberLoad kpis={data.kpis} />}
          </div>
          {projectId === null && isManager && data.people && (
            <People people={data.people} timeWeek={data.timeWeek} />
          )}
          {projectId === null && isManager && (
            <PhaseTwo scorecards={data.scorecards} timeWeek={data.timeWeek} />
          )}
        </>
      ) : null}
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // 32px reads right in a dense filter row but is under the 44px touch
        // floor, so the hit area is grown with a pseudo-element instead of the
        // visible chip. The 6px row gap means neighbours only ever touch.
        "press relative flex h-8 max-w-48 items-center gap-1.5 rounded-full px-3 text-dense",
        "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
        active
          ? "bg-ink text-bg font-medium"
          : "bg-raised text-muted hover:text-ink",
      )}
    >
      {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

/* ---------------------------- narrative ---------------------------------- */

function NarrativeFeedback({ narrativeId }: { narrativeId: string }) {
  const { workspace } = useWorkspace();
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  const rate = (next: "up" | "down") => {
    const value = vote === next ? null : next;
    setVote(value);
    void apiMutate(`/api/w/${workspace.slug}/narrative/${narrativeId}/rate`, {
      method: "POST",
      body: { vote: value },
    }).catch(() => undefined);
  };

  return (
    <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5">
      <span className="text-meta text-faint">Was this useful?</span>
      <button
        onClick={() => rate("up")}
        aria-label="Helpful"
        className={cn(
          "press rounded-control p-1.5 hover:bg-raised",
          vote === "up" ? "text-ok" : "text-faint",
        )}
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        onClick={() => rate("down")}
        aria-label="Not helpful"
        className={cn(
          "press rounded-control p-1.5 hover:bg-raised",
          vote === "down" ? "text-danger" : "text-faint",
        )}
      >
        <ThumbsDown className="size-3.5" />
      </button>
      {vote && <span className="text-meta text-faint">Thanks, noted.</span>}
    </div>
  );
}

function NarrativeSection({ narratives }: { narratives?: NarrativeRow[] }) {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ narrative: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [history, setHistory] = useState(false);
  const latest = narratives?.[0];
  const isAdmin = workspace.role !== "member";

  const generatePreview = async () => {
    setLoadingPreview(true);
    try {
      const res = await apiMutate<{ narrative: string }>(
        `/api/w/${workspace.slug}/narrative/preview`,
        { method: "POST" },
      );
      if (!("queued" in res && res.queued)) setPreview(res);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Preview failed", {
        variant: "error",
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <section className="mt-5" aria-label="Weekly briefing">
      <div className="rounded-card bg-surface p-5">
        <div className="flex items-center gap-2">
          {/* The same 6px accent square the morning brief wears. Both of these
              are the workspace writing to you, so they carry one house mark;
              the Sparkles that used to sit here claimed the weekly narrative
              was magic, when its whole pitch is that it is routine. */}
          <span className="size-1.5 shrink-0 rounded-[2px] bg-accent" aria-hidden />
          <h2 className={cn("flex-1", SECTION_HEAD)}>
            {latest
              ? `Weekly briefing · week of ${formatDay(latest.weekStart)}`
              : "Weekly briefing"}
          </h2>
          {latest && (
            <span className="text-meta text-faint">{timeAgo(latest.createdAt)}</span>
          )}
        </div>

        {latest ? (
          <>
            <div className="mt-3 whitespace-pre-wrap text-body leading-relaxed text-ink/95">
              {latest.narrative}
            </div>
            <NarrativeFeedback narrativeId={latest.id} />
          </>
        ) : preview ? (
          <>
            <p className="mt-3 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-meta font-medium text-accent">
              Preview, the real one lands Monday 06:30
            </p>
            <div className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-ink/95">
              {preview.narrative}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <p className="text-body text-muted">
              Every Monday at 06:30 a short, human briefing lands here, what
              got done, what’s at risk, who’s carrying too much, what to watch.
              Written from your team’s actual activity. Nobody compiles a
              status report again.
            </p>
            {isAdmin && (
              <Button
                size="sm"
                variant="quiet"
                className="mt-3"
                loading={loadingPreview}
                onClick={() => void generatePreview()}
              >
                <Sparkles className="size-4 text-accent" />
                Preview this week so far
              </Button>
            )}
          </div>
        )}
      </div>

      {narratives && narratives.length > 1 && (
        <div className="mt-2">
          <button
            onClick={() => setHistory((h) => !h)}
            className="press rounded-control px-2 py-1 text-meta font-medium text-faint hover:text-muted"
          >
            {history ? "Hide past briefings" : `Past briefings (${narratives.length - 1})`}
          </button>
          {history &&
            narratives.slice(1).map((n) => (
              <details key={n.id} className="mt-1 rounded-card bg-surface px-4 py-3">
                <summary className="cursor-pointer select-none text-body font-medium text-muted">
                  Week of {formatDay(n.weekStart)}
                </summary>
                <div className="mt-2 whitespace-pre-wrap text-dense leading-relaxed text-ink/90">
                  {n.narrative}
                </div>
              </details>
            ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ KPI board -------------------------------- */

/**
 * One hero, two states, a footnote. Six identical tiles gave "Overdue, needs a
 * decision" exactly the voice of "Open now", which is a grid filled by listing
 * the metrics we happen to have rather than by deciding what an owner opens
 * this page to find out. Tiles are wells, not cards: elevation in this system
 * means a thing can be opened or dragged, and a number can do neither.
 */
function KpiBoard({ kpis }: { kpis: WorkspaceKpis }) {
  const rate = kpis.completionRatePct;

  return (
    <section className="mt-group" aria-label="Key numbers">
      <div className="grid gap-sibling sm:grid-cols-3">
        <div className="rounded-card bg-sunken p-item sm:col-span-2">
          <h2 className={SECTION_HEAD}>Completion rate</h2>
          <p className="ledger mt-tight num text-display font-bold">
            {rate !== null ? `${rate}%` : "-"}
            <Ledger value={rate ?? 0} of={rate !== null ? 100 : null} />
          </p>
          <p className="mt-tight text-meta text-faint">
            of this week’s plate got done
          </p>
        </div>

        <div className="rounded-card bg-sunken p-item">
          <h2 className={SECTION_HEAD}>Done this week</h2>
          {/* Measured against what came in, so a big number in a big week
              still reads as the share it actually is. */}
          <p className="ledger mt-tight num text-display-sm">
            {kpis.completedThisWeek}
            <Ledger
              value={kpis.completedThisWeek}
              of={kpis.createdThisWeek > 0 ? kpis.createdThisWeek : null}
            />
          </p>
          <p className="mt-tight text-meta text-faint">
            {kpis.createdThisWeek} new came in
          </p>
        </div>
      </div>

      <div className="mt-sibling grid grid-cols-2 gap-sibling">
        <StateTile
          label="Overdue"
          count={kpis.overdueNow}
          of={kpis.openNow}
          tone="danger"
          context={kpis.overdueNow > 0 ? "need a decision" : "nothing slipping"}
        />
        <StateTile
          label="Stale"
          count={kpis.staleNow}
          of={kpis.openNow}
          tone="warn"
          context={
            kpis.staleNow > 0 ? "untouched for a while" : "nothing gone quiet"
          }
        />
      </div>

      {/* The genuinely secondary numbers. They answer a question nobody opens
          this page with, so they get a line, not a box. */}
      <p className="mt-item text-meta text-faint">
        {kpis.avgCycleTimeDays !== null && (
          <>
            Cycle time{" "}
            <span className="num text-ink">{kpis.avgCycleTimeDays}d</span>{" "}
            created to done ·{" "}
          </>
        )}
        <span className="num text-ink">{kpis.openNow}</span> open across active
        projects
      </p>
    </section>
  );
}

/**
 * A state that earns emphasis. The rail carries the tone, not the digits:
 * colouring the number puts the alarm inside the reading line where it
 * competes with the value. At zero there is no rail and no rule, so a calm
 * week looks calm. Tone is set inline because "stale" is not one of the
 * time-pressure states the rail-* classes name.
 */
function StateTile({
  label,
  count,
  context,
  of,
  tone,
}: {
  label: string;
  count: number;
  context: string;
  of: number;
  tone: "danger" | "warn";
}) {
  const active = count > 0;
  return (
    <div
      className="rail rounded-card bg-sunken p-item"
      style={active ? styleVars({ "--rail": `var(--${tone})` }) : undefined}
    >
      <h2 className={SECTION_HEAD}>{label}</h2>
      <p className="ledger mt-tight num text-display-sm">
        {count}
        {/* Share of everything still open, so "3 overdue" of 9 and of 90 stop
            looking like the same sentence. */}
        <Ledger value={count} of={active ? of : null} tone={tone} />
      </p>
      <p className="mt-tight text-meta text-faint">{context}</p>
    </div>
  );
}

/* ------------------------------ momentum --------------------------------- */

function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/**
 * Day blocks + streak: consecutive WEEKDAYS with at least one completion,
 * counted back from today (an empty today doesn't break the run until the
 * day is over, and weekends never count against anyone).
 */
function Momentum({ days }: { days: WorkspaceKpis["completionsByDay"] }) {
  const weekdays = days.filter((d) => {
    const wd = weekdayOf(d.day);
    return wd >= 1 && wd <= 5;
  });
  const blocks = weekdays.slice(-15);
  const today = days[days.length - 1];

  let streak = 0;
  for (let i = weekdays.length - 1; i >= 0; i--) {
    const d = weekdays[i];
    if (d.completed > 0) {
      streak++;
      continue;
    }
    if (d.day === today?.day) continue; // today isn't over yet
    break;
  }

  const doneThisMonth = days.slice(-28).reduce((s, d) => s + d.completed, 0);

  return (
    <section
      className="mt-4 rounded-card bg-surface p-4"
      aria-label="Completion momentum"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-32">
          <h3 className={SECTION_HEAD}>Momentum</h3>
          {/* No ledger under the streak: a run of days has no ceiling to be a
              share of, and inventing one would be a chart pretending to be a
              fact. The blocks beside it already carry the shape. */}
          <p className="mt-tight num text-display-sm">
            {streak}
            <span className="ml-1.5 text-meta font-medium text-muted">
              day streak
            </span>
          </p>
          <p className="mt-tight text-meta text-faint">
            weekdays in a row with something finished
          </p>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-end gap-1">
            {blocks.map((d) => {
              const isToday = d.day === today?.day;
              return (
                <div
                  key={d.day}
                  role="img"
                  aria-label={`${formatDay(d.day)}: ${d.completed} completed`}
                  title={`${formatDay(d.day)} · ${d.completed} done`}
                  className={cn(
                    "size-7 rounded-chip sm:size-8",
                    d.completed === 0 && "bg-raised",
                    d.completed === 1 && "bg-accent/30",
                    d.completed >= 2 && d.completed <= 3 && "bg-accent/55",
                    d.completed >= 4 && "bg-accent",
                    isToday && "ring-2 ring-accent/50 ring-offset-1 ring-offset-[var(--surface)]",
                  )}
                />
              );
            })}
          </div>
          <p className="mt-2 text-meta text-faint">
            last {blocks.length} weekdays · {doneThisMonth} done in 28 days ·
            darker means more
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- throughput bars ------------------------------ */

function ThroughputChart({
  weeks,
}: {
  weeks: { weekStart: string; completed: number }[];
}) {
  const max = Math.max(1, ...weeks.map((w) => w.completed));
  return (
    <section className="rounded-card bg-surface p-4" aria-label="Weekly throughput">
      <h3 className={SECTION_HEAD}>Throughput</h3>
      <p className="mt-hair text-meta text-faint">
        tasks completed per week, last 8 weeks
      </p>
      <div className="mt-4 flex h-36 items-end gap-1.5">
        {weeks.map((w, i) => {
          const pct = Math.round((w.completed / max) * 100);
          const isLast = i === weeks.length - 1;
          const inside = pct >= 26 && w.completed > 0;
          return (
            <div
              key={w.weekStart}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
            >
              {!inside && w.completed > 0 && (
                <span className="mb-1 num text-micro font-medium leading-none text-muted">
                  {w.completed}
                </span>
              )}
              <div
                role="img"
                aria-label={`Week of ${formatDay(w.weekStart)}: ${w.completed} completed`}
                title={`Week of ${formatDay(w.weekStart)} · ${w.completed} done`}
                className={cn(
                  "relative flex w-full max-w-9 items-start justify-center rounded-chip pt-1 transition-colors",
                  isLast ? "bg-accent" : "bg-accent/45 hover:bg-accent/70",
                )}
                style={{ height: `${Math.max(6, pct)}%` }}
              >
                {inside && (
                  <span
                    className={cn(
                      "num text-micro font-semibold leading-none",
                      isLast ? "text-on-accent" : "text-ink/70",
                    )}
                  >
                    {w.completed}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-line pt-1.5">
        {weeks.map((w, i) => (
          <span
            key={w.weekStart}
            className="flex-1 text-center text-micro leading-none text-faint"
          >
            {i % 2 === 1 ? formatDay(w.weekStart).replace(/^\w+ /, "") : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ people ----------------------------------- */

/**
 * The ops-manager table: what each person finished (7/28 days, the same
 * actor-attributed numbers the weekly narrative uses) and what they carry.
 * Manager-only; members never receive this payload.
 */
function People({
  people,
  timeWeek,
}: {
  people: MemberPerformanceRow[];
  timeWeek?: WeekTimeDTO;
}) {
  const minutesByUser = new Map(
    (timeWeek?.byMember ?? []).map((m) => [m.user.id, m.minutes]),
  );
  const showTime = Boolean(timeWeek);

  return (
    <section className="mt-6" aria-label="People">
      <h2 className={SECTION_HEAD}>People</h2>
      <p className="mt-tight text-meta text-muted">
        Only admins see this. Numbers come from the work itself, done means
        marked done by that person.
      </p>
      <div className="mt-2 overflow-x-auto rounded-card bg-surface">
        <table className="w-full min-w-[28rem] text-dense">
          <thead>
            <tr className="border-b border-line text-left text-meta text-faint">
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 text-right font-medium">Done 7d</th>
              <th className="px-3 py-2 text-right font-medium">Done 28d</th>
              <th className="px-3 py-2 text-right font-medium">Open</th>
              <th className="px-3 py-2 text-right font-medium">Overdue</th>
              {showTime && (
                <th className="px-3 py-2 text-right font-medium">Time (wk)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user.id} className="border-b border-line/60 last:border-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <Avatar
                      name={p.user.name}
                      email={p.user.email}
                      image={p.user.image}
                      size={22}
                    />
                    <span className="min-w-0 truncate font-medium">
                      {p.user.name ?? p.user.email}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular font-semibold">
                  {p.completed7d}
                </td>
                <td className="px-3 py-2.5 text-right tabular text-muted">
                  {p.completed28d}
                </td>
                <td className="px-3 py-2.5 text-right tabular text-muted">
                  {p.openNow}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 text-right tabular",
                    p.overdueNow > 0
                      ? "font-semibold text-danger-quiet"
                      : "text-faint",
                  )}
                >
                  {p.overdueNow}
                </td>
                {showTime && (
                  <td className="px-3 py-2.5 text-right tabular text-muted">
                    {formatMinutes(minutesByUser.get(p.user.id) ?? 0)}
                  </td>
                )}
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={showTime ? 6 : 5} className="px-3 py-4 text-dense text-faint">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------------------- member load -------------------------------- */

function MemberLoad({ kpis }: { kpis: WorkspaceKpis }) {
  const max = Math.max(1, ...kpis.memberLoad.map((m) => m.open));
  return (
    <section className="rounded-card bg-surface p-4" aria-label="Load per person">
      <h3 className={SECTION_HEAD}>Who’s carrying what</h3>
      <p className="mt-hair text-meta text-faint">
        open tasks per person, spot the overload
      </p>
      <div className="mt-4 space-y-2.5">
        {kpis.memberLoad.map((m) => {
          const pct = Math.round((m.open / max) * 100);
          const inside = pct >= 22 && m.open > 0;
          return (
            <div key={m.user.id} className="flex items-center gap-2.5">
              <Avatar
                name={m.user.name}
                email={m.user.email}
                image={m.user.image}
                size={22}
              />
              <span className="w-24 truncate text-dense sm:w-28">
                {m.user.name ?? m.user.email.split("@")[0]}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-chip bg-raised">
                <div
                  className="flex h-full items-center justify-end rounded-r-chip bg-accent/70 pr-1.5"
                  style={{ width: `${pct}%` }}
                >
                  {inside && (
                    <span className="num text-micro font-semibold leading-none text-on-accent">
                      {m.open}
                    </span>
                  )}
                </div>
                {!inside && (
                  <span className="absolute inset-y-0 left-1.5 flex items-center num text-micro font-medium text-muted">
                    {m.open}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "w-16 text-right num text-meta",
                  m.overdue > 0 ? "font-semibold text-danger-quiet" : "text-faint",
                )}
              >
                {m.overdue > 0 ? `${m.overdue} overdue` : "-"}
              </span>
            </div>
          );
        })}
        {kpis.memberLoad.length === 0 && (
          <p className="text-dense text-faint">No members yet.</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------- Phase 2: scorecards + time --------------------- */

function PhaseTwo({
  scorecards,
  timeWeek,
}: {
  scorecards?: ScorecardDTO[];
  timeWeek?: WeekTimeDTO;
}) {
  const hasScorecards = useFeature("scorecards");
  const hasTime = useFeature("time_tracking");

  return (
    <>
      {hasScorecards ? (
        <Scorecards scorecards={scorecards ?? []} />
      ) : (
        <FeatureTeaser
          feature="scorecards"
          title="Scorecards"
          blurb="Track the business numbers that matter, one entry a week, straight into the Monday briefing."
        />
      )}
      {hasTime ? (
        <TimeWeekCard timeWeek={timeWeek} />
      ) : (
        <FeatureTeaser
          feature="time_tracking"
          title="Time tracking"
          blurb="Timers on tasks, and a weekly view of where the hours actually went."
        />
      )}
    </>
  );
}

/** Locked-feature card; names the cheapest plan that unlocks it (from config). */
function FeatureTeaser({
  feature,
  title,
  blurb,
}: {
  feature: Feature;
  title: string;
  blurb: string;
}) {
  const { workspace } = useWorkspace();
  const isAdmin = workspace.role !== "member";
  const plan = planWithFeature(feature);
  if (!isAdmin) return null;
  return (
    <section className="mt-4 rounded-card border border-dashed border-line-strong bg-surface/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-body font-semibold">
            {title}
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-micro font-medium text-accent-quiet">
              {plan.name}
            </span>
          </p>
          <p className="mt-tight text-dense text-muted">{blurb}</p>
        </div>
        <Button
          size="sm"
          variant="quiet"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("aw:limit", {
                detail: {
                  limit: "feature",
                  feature,
                  message: `${title} comes with the ${plan.name} plan`,
                },
              }),
            )
          }
        >
          See {plan.name}
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------ scorecards -------------------------------- */

function fmtValue(unit: ScorecardUnit, v: number): string {
  if (unit === "currency") return `R${v.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
  if (unit === "percent") return `${v}%`;
  if (unit === "hours") return `${v}h`;
  return String(v);
}

function periodLabel(period: "weekly" | "monthly", periodStart: string): string {
  if (period === "weekly") return `week of ${formatDay(periodStart)}`;
  return new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${periodStart}T12:00:00Z`));
}

/** Walk back N period starts from the current one (inclusive, oldest first). */
function periodSlots(card: ScorecardDTO, n: number): string[] {
  const out: string[] = [];
  let cursor = card.currentPeriodStart;
  for (let i = 0; i < n; i++) {
    out.unshift(cursor);
    if (card.period === "weekly") {
      const d = new Date(`${cursor}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7);
      cursor = d.toISOString().slice(0, 10);
    } else {
      const [y, m] = cursor.split("-").map(Number);
      const prev = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
      cursor = prev;
    }
  }
  return out;
}

function Scorecards({ scorecards }: { scorecards: ScorecardDTO[] }) {
  const { workspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const isAdmin = workspace.role !== "member";

  return (
    <section className="mt-6" aria-label="Scorecards">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className={SECTION_HEAD}>Scorecards</h2>
          <p className="mt-hair text-meta text-faint">
            the numbers you track by hand, beside the ones that track themselves
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="quiet" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Scorecard
          </Button>
        )}
      </div>

      {scorecards.length === 0 ? (
        <div className="mt-3 rounded-card border border-dashed border-line-strong bg-surface/60 p-4">
          <p className="text-dense text-muted">
            New business, client NPS, invoices sent, whatever the studio steers
            by. Add a scorecard and fill in one number a {""}
            week. It lands in the Monday briefing too.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {scorecards.map((c) => (
            <ScorecardCard key={c.id} card={c} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {creating && <NewScorecardDialog onClose={() => setCreating(false)} />}
    </section>
  );
}

function ScorecardCard({ card, isAdmin }: { card: ScorecardDTO; isAdmin: boolean }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const byPeriod = new Map(card.entries.map((e) => [e.periodStart, e.value]));
  const current = byPeriod.get(card.currentPeriodStart);
  const slots = periodSlots(card, 8);

  const save = async () => {
    const value = Number(draft);
    if (!Number.isFinite(value)) return setEditing(false);
    setEditing(false);
    try {
      await apiMutate(`/api/w/${workspace.slug}/scorecards/${card.id}`, {
        method: "PUT",
        body: { periodStart: card.currentPeriodStart, value },
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "dashboard"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save that", {
        variant: "error",
      });
    }
  };

  const archive = async () => {
    try {
      await apiMutate(`/api/w/${workspace.slug}/scorecards/${card.id}`, {
        method: "DELETE",
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "dashboard"] });
      toast("Scorecard archived, its history is kept");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't archive", {
        variant: "error",
      });
    }
  };

  const onTrack =
    card.target !== null && current !== undefined ? current >= card.target : null;

  return (
    <div className="rounded-card bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Not the section-head idiom: this is a name the customer typed, so
              it stays sentence case and truncates. */}
          <p className="truncate text-meta font-medium text-faint">{card.name}</p>
          {/* The ledger sits on the wrapper, not the value, so the rule spans
              the card and reads as a gauge rather than an underline. */}
          <div className="ledger mt-1">
            {editing ? (
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") setEditing(false);
                }}
                aria-label={`${card.name}, this ${card.period === "weekly" ? "week" : "month"}`}
                className="w-28 rounded-control border border-line bg-bg px-2 py-1 num text-title outline-none focus:border-accent"
              />
            ) : (
              <button
                onClick={() => {
                  setDraft(current !== undefined ? String(current) : "");
                  setEditing(true);
                }}
                className={cn(
                  "press rounded-control text-left num text-title",
                  current === undefined && "text-faint",
                )}
                title="Tap to enter this period's number"
              >
                {current !== undefined ? fmtValue(card.unit, current) : "+ add"}
              </button>
            )}
            {!editing && current !== undefined && (
              <Ledger value={current} of={card.target} />
            )}
          </div>
          <p className="mt-tight text-meta text-faint">
            {periodLabel(card.period, card.currentPeriodStart)}
            {card.target !== null && (
              <span
                className={cn(
                  "ml-1.5",
                  onTrack === true && "font-medium text-ok-quiet",
                  onTrack === false && "font-medium text-warn-quiet",
                )}
              >
                target {fmtValue(card.unit, card.target)}
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Menu
            align="end"
            trigger={
              <button
                aria-label={`Options for ${card.name}`}
                className="press rounded-control p-1 text-faint hover:bg-raised hover:text-ink"
              >
                <Archive className="size-3.5" />
              </button>
            }
          >
            {(close) => (
              <MenuItem
                onClick={() => {
                  close();
                  void archive();
                }}
              >
                <Archive className="size-4" /> Archive scorecard
              </MenuItem>
            )}
          </Menu>
        )}
      </div>

      {/* Period blocks: darker = closer to target (or simply filled). */}
      <div className="mt-3 flex items-end gap-1">
        {slots.map((p) => {
          const v = byPeriod.get(p);
          const ratio =
            v === undefined
              ? null
              : card.target
                ? Math.min(1, v / card.target)
                : 1;
          return (
            <div
              key={p}
              role="img"
              aria-label={`${periodLabel(card.period, p)}: ${v !== undefined ? fmtValue(card.unit, v) : "no entry"}`}
              title={`${periodLabel(card.period, p)} · ${v !== undefined ? fmtValue(card.unit, v) : "no entry"}`}
              className={cn(
                "h-6 flex-1 rounded-chip",
                ratio === null && "border border-dashed border-line bg-transparent",
                ratio !== null && ratio < 0.6 && "bg-accent/30",
                ratio !== null && ratio >= 0.6 && ratio < 1 && "bg-accent/55",
                ratio !== null && ratio >= 1 && "bg-accent",
                p === card.currentPeriodStart && "ring-1 ring-accent/50",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function NewScorecardDialog({ onClose }: { onClose: () => void }) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ScorecardUnit>("count");
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await apiMutate(`/api/w/${workspace.slug}/scorecards`, {
        method: "POST",
        body: {
          name: name.trim(),
          unit,
          period,
          target: target.trim() === "" ? null : Number(target),
        },
      });
      await qc.invalidateQueries({ queryKey: ["ws", workspace.slug, "dashboard"] });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't create it", {
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "press rounded-full px-3 py-1.5 text-dense",
      active ? "bg-ink text-bg font-medium" : "bg-raised text-muted hover:text-ink",
    );

  return (
    <Dialog open onClose={onClose} ariaLabel="New scorecard" variant="center">
      <DialogHeader title="New scorecard" onClose={onClose} />
      <form onSubmit={submit} className="space-y-4 px-5 pb-5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. New business calls"
          aria-label="Scorecard name"
          required
          maxLength={60}
          autoFocus
        />
        <div>
          <p className="text-meta font-medium text-faint">Unit</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(
              [
                ["count", "Count"],
                ["currency", "Rand"],
                ["percent", "%"],
                ["hours", "Hours"],
              ] as const
            ).map(([u, label]) => (
              <button type="button" key={u} className={chip(unit === u)} onClick={() => setUnit(u)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-meta font-medium text-faint">Rhythm</p>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" className={chip(period === "weekly")} onClick={() => setPeriod("weekly")}>
              Weekly
            </button>
            <button type="button" className={chip(period === "monthly")} onClick={() => setPeriod("monthly")}>
              Monthly
            </button>
          </div>
        </div>
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target (optional)"
          aria-label="Target value"
          type="number"
          inputMode="decimal"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------ time week --------------------------------- */

function TimeWeekCard({ timeWeek }: { timeWeek?: WeekTimeDTO }) {
  if (!timeWeek) return null;
  const max = Math.max(1, ...timeWeek.byMember.map((m) => m.minutes));

  return (
    <section className="mt-6 rounded-card bg-surface p-4" aria-label="Time this week">
      <div className="flex items-baseline gap-3">
        <div className="flex-1">
          <h3 className={SECTION_HEAD}>Time this week</h3>
          <p className="mt-hair text-meta text-faint">
            logged with timers and quick logs
          </p>
        </div>
        {/* No ledger on the total: there is no hours budget in the product, and
            a denominator we made up would be a chart pretending to be a fact. */}
        <p className="num text-display-sm">
          {formatMinutes(timeWeek.totalMinutes)}
        </p>
      </div>

      {timeWeek.byMember.length === 0 ? (
        <p className="mt-3 text-dense text-faint">
          Nothing logged yet. Start a timer from any task.
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {timeWeek.byMember.map((m) => {
              const pct = Math.round((m.minutes / max) * 100);
              const inside = pct >= 30;
              return (
                <div key={m.user.id} className="flex items-center gap-2.5">
                  <Avatar
                    name={m.user.name}
                    email={m.user.email}
                    image={m.user.image}
                    size={22}
                  />
                  <span className="w-24 truncate text-dense sm:w-28">
                    {m.user.name ?? m.user.email.split("@")[0]}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-chip bg-raised">
                    <div
                      className="flex h-full items-center justify-end rounded-r-chip bg-accent/70 pr-1.5"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    >
                      {inside && (
                        <span className="num text-micro font-semibold leading-none text-on-accent">
                          {formatMinutes(m.minutes)}
                        </span>
                      )}
                    </div>
                    {!inside && (
                      <span className="absolute inset-y-0 left-1.5 flex items-center num text-micro font-medium text-muted">
                        {formatMinutes(m.minutes)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {timeWeek.byProject.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {timeWeek.byProject.slice(0, 4).map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-meta text-muted"
                >
                  <span className="size-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  <span className="num font-semibold text-ink">
                    {formatMinutes(p.minutes)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
