"use client";

/**
 * The "it reports itself" surface: the Monday narrative front and centre,
 * zero-setup KPIs beneath it, then the Phase 2 layer (scorecards + time).
 * Visual language throughout: values live INSIDE the bars, labels sit
 * outside; day/period blocks carry intensity, never colour alone (numbers
 * are always present in text or tooltips).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useFeature, useWorkspace } from "@/lib/client/workspace";
import { planWithFeature, type Feature } from "@/lib/plans";
import { formatDay, formatMinutes, timeAgo } from "@/lib/dates";
import type {
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
  scorecards?: ScorecardDTO[];
  timeWeek?: WeekTimeDTO;
  narratives: NarrativeRow[];
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
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-0.5 text-sm text-muted">
        Nobody compiled this. It’s all from the work itself.
      </p>

      {/* Scope chips */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
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
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          <KpiTiles kpis={data.kpis} />
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
        "press flex h-8 max-w-48 items-center gap-1.5 rounded-full px-3 text-sm",
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
      <span className="text-xs text-faint">Was this useful?</span>
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
      {vote && <span className="text-xs text-faint">Thanks, noted.</span>}
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
          <Sparkles className="size-4 text-accent" />
          <h2 className="flex-1 text-sm font-semibold">
            {latest
              ? `Weekly briefing · week of ${formatDay(latest.weekStart)}`
              : "Weekly briefing"}
          </h2>
          {latest && (
            <span className="text-xs text-faint">{timeAgo(latest.createdAt)}</span>
          )}
        </div>

        {latest ? (
          <>
            <div className="mt-3 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink/95">
              {latest.narrative}
            </div>
            <NarrativeFeedback narrativeId={latest.id} />
          </>
        ) : preview ? (
          <>
            <p className="mt-3 inline-block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              Preview, the real one lands Monday 06:30
            </p>
            <div className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink/95">
              {preview.narrative}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted">
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
            className="press rounded-control px-2 py-1 text-xs font-medium text-faint hover:text-muted"
          >
            {history ? "Hide past briefings" : `Past briefings (${narratives.length - 1})`}
          </button>
          {history &&
            narratives.slice(1).map((n) => (
              <details key={n.id} className="mt-1 rounded-card bg-surface px-4 py-3">
                <summary className="cursor-pointer select-none text-sm font-medium text-muted">
                  Week of {formatDay(n.weekStart)}
                </summary>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                  {n.narrative}
                </div>
              </details>
            ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ KPI tiles -------------------------------- */

function KpiTiles({ kpis }: { kpis: WorkspaceKpis }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tile
        label="Completion rate"
        value={kpis.completionRatePct !== null ? `${kpis.completionRatePct}%` : "-"}
        context="of this week's plate got done"
      />
      <Tile
        label="Done this week"
        value={String(kpis.completedThisWeek)}
        context={`${kpis.createdThisWeek} new came in`}
      />
      <Tile
        label="Overdue"
        value={String(kpis.overdueNow)}
        tone={kpis.overdueNow > 0 ? "danger" : "ok"}
        context={kpis.overdueNow > 0 ? "need a decision" : "nothing slipping"}
      />
      <Tile
        label="Stale"
        value={String(kpis.staleNow)}
        tone={kpis.staleNow > 0 ? "warn" : undefined}
        context="untouched for a while"
      />
      <Tile
        label="Cycle time"
        value={kpis.avgCycleTimeDays !== null ? `${kpis.avgCycleTimeDays}d` : "-"}
        context="created → done, this week"
      />
      <Tile label="Open now" value={String(kpis.openNow)} context="across active projects" />
    </div>
  );
}

function Tile({
  label,
  value,
  context,
  tone,
}: {
  label: string;
  value: string;
  context: string;
  tone?: "danger" | "warn" | "ok";
}) {
  return (
    <div className="rounded-card bg-surface p-4">
      <p className="text-xs font-medium text-faint">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight tabular",
          tone === "danger" && "text-danger",
          tone === "warn" && "text-warn",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-faint">{context}</p>
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
          <h3 className="text-sm font-semibold">Momentum</h3>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
            {streak}
            <span className="ml-1.5 text-sm font-medium text-muted">
              day streak
            </span>
          </p>
          <p className="mt-0.5 text-xs text-faint">
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
                    "size-7 rounded-[7px] sm:size-8",
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
          <p className="mt-2 text-xs text-faint">
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
      <h3 className="text-sm font-semibold">Throughput</h3>
      <p className="text-xs text-faint">tasks completed per week, last 8 weeks</p>
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
                <span className="mb-1 text-[10px] font-medium tabular leading-none text-muted">
                  {w.completed}
                </span>
              )}
              <div
                role="img"
                aria-label={`Week of ${formatDay(w.weekStart)}: ${w.completed} completed`}
                title={`Week of ${formatDay(w.weekStart)} · ${w.completed} done`}
                className={cn(
                  "relative flex w-full max-w-9 items-start justify-center rounded-[7px] pt-1 transition-colors",
                  isLast ? "bg-accent" : "bg-accent/45 hover:bg-accent/70",
                )}
                style={{ height: `${Math.max(6, pct)}%` }}
              >
                {inside && (
                  <span
                    className={cn(
                      "text-[10px] font-semibold tabular leading-none",
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
            className="flex-1 text-center text-[9px] leading-none text-faint"
          >
            {i % 2 === 1 ? formatDay(w.weekStart).replace(/^\w+ /, "") : ""}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------- member load -------------------------------- */

function MemberLoad({ kpis }: { kpis: WorkspaceKpis }) {
  const max = Math.max(1, ...kpis.memberLoad.map((m) => m.open));
  return (
    <section className="rounded-card bg-surface p-4" aria-label="Load per person">
      <h3 className="text-sm font-semibold">Who’s carrying what</h3>
      <p className="text-xs text-faint">open tasks per person, spot the overload</p>
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
              <span className="w-24 truncate text-sm sm:w-28">
                {m.user.name ?? m.user.email.split("@")[0]}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded-[6px] bg-raised">
                <div
                  className="flex h-full items-center justify-end rounded-r-[6px] bg-accent/70 pr-1.5"
                  style={{ width: `${pct}%` }}
                >
                  {inside && (
                    <span className="text-[10px] font-semibold tabular leading-none text-on-accent">
                      {m.open}
                    </span>
                  )}
                </div>
                {!inside && (
                  <span className="absolute inset-y-0 left-1.5 flex items-center text-[10px] font-medium tabular text-muted">
                    {m.open}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "w-16 text-right text-xs tabular",
                  m.overdue > 0 ? "font-semibold text-danger" : "text-faint",
                )}
              >
                {m.overdue > 0 ? `${m.overdue} overdue` : "-"}
              </span>
            </div>
          );
        })}
        {kpis.memberLoad.length === 0 && (
          <p className="text-sm text-faint">No members yet.</p>
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
          <p className="text-sm font-semibold">
            {title}
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              {plan.name}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-muted">{blurb}</p>
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
          <h2 className="text-sm font-semibold">Scorecards</h2>
          <p className="text-xs text-faint">
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
          <p className="text-sm text-muted">
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
          <p className="truncate text-xs font-medium text-faint">{card.name}</p>
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
              className="mt-1 w-28 rounded-control border border-line bg-bg px-2 py-1 text-xl font-semibold tabular outline-none focus:border-accent"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(current !== undefined ? String(current) : "");
                setEditing(true);
              }}
              className={cn(
                "press mt-1 rounded-control text-left text-2xl font-semibold tracking-tight tabular",
                current === undefined && "text-faint",
              )}
              title="Tap to enter this period's number"
            >
              {current !== undefined ? fmtValue(card.unit, current) : "+ add"}
            </button>
          )}
          <p className="mt-0.5 text-xs text-faint">
            {periodLabel(card.period, card.currentPeriodStart)}
            {card.target !== null && (
              <span
                className={cn(
                  "ml-1.5",
                  onTrack === true && "font-medium text-ok",
                  onTrack === false && "font-medium text-warn",
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
                "h-6 flex-1 rounded-[5px]",
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
      "press rounded-full px-3 py-1.5 text-sm",
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
          <p className="text-xs font-medium text-faint">Unit</p>
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
          <p className="text-xs font-medium text-faint">Rhythm</p>
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
          <h3 className="text-sm font-semibold">Time this week</h3>
          <p className="text-xs text-faint">logged with timers and quick logs</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular">
          {formatMinutes(timeWeek.totalMinutes)}
        </p>
      </div>

      {timeWeek.byMember.length === 0 ? (
        <p className="mt-3 text-sm text-faint">
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
                  <span className="w-24 truncate text-sm sm:w-28">
                    {m.user.name ?? m.user.email.split("@")[0]}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-[6px] bg-raised">
                    <div
                      className="flex h-full items-center justify-end rounded-r-[6px] bg-accent/70 pr-1.5"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    >
                      {inside && (
                        <span className="text-[10px] font-semibold tabular leading-none text-on-accent">
                          {formatMinutes(m.minutes)}
                        </span>
                      )}
                    </div>
                    {!inside && (
                      <span className="absolute inset-y-0 left-1.5 flex items-center text-[10px] font-medium tabular text-muted">
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
                  className="flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 text-xs text-muted"
                >
                  <span className="size-2 rounded-full" style={{ background: p.color }} />
                  {p.name}
                  <span className="font-semibold tabular text-ink">
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
