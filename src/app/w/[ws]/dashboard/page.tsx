"use client";

/**
 * The "it reports itself" surface: the Monday narrative front and centre,
 * zero-setup KPIs beneath it. Stat tiles carry the headline numbers; the
 * only charts are a single-series throughput bar and member-load bars
 * (thin marks, rounded data-ends, values as text — never colour alone).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { formatDay, timeAgo } from "@/lib/dates";
import type { WorkspaceKpis } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  narratives: NarrativeRow[];
}

export default function DashboardPage() {
  const { workspace, projects } = useWorkspace();
  const [projectId, setProjectId] = useState<string | null>(null);

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
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <ThroughputChart weeks={data.kpis.throughputByWeek} />
            <MemberLoad kpis={data.kpis} />
          </div>
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
      {vote && <span className="text-xs text-faint">Thanks — noted.</span>}
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
              Preview — the real one lands Monday 06:30
            </p>
            <div className="mt-2 whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink/95">
              {preview.narrative}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-muted">
              Every Monday at 06:30 a short, human briefing lands here — what
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
        value={kpis.completionRatePct !== null ? `${kpis.completionRatePct}%` : "—"}
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
        value={kpis.avgCycleTimeDays !== null ? `${kpis.avgCycleTimeDays}d` : "—"}
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
      <div className="mt-4 flex h-28 items-end gap-1.5">
        {weeks.map((w, i) => {
          const h = Math.max(4, Math.round((w.completed / max) * 100));
          const isLast = i === weeks.length - 1;
          return (
            <div
              key={w.weekStart}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
            >
              <span
                className={cn(
                  "mb-1 text-[10px] tabular leading-none",
                  w.completed === max || isLast ? "text-muted" : "text-transparent group-hover:text-muted",
                )}
              >
                {w.completed}
              </span>
              <div
                role="img"
                aria-label={`Week of ${formatDay(w.weekStart)}: ${w.completed} completed`}
                className={cn(
                  "w-full max-w-7 rounded-t-[4px] transition-colors",
                  isLast ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70",
                )}
                style={{ height: `${h}%` }}
              />
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
      <p className="text-xs text-faint">open tasks per person — spot the overload</p>
      <div className="mt-4 space-y-2.5">
        {kpis.memberLoad.map((m) => (
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
            <div className="h-4 flex-1 overflow-hidden rounded-[4px] bg-raised">
              <div
                className="h-full rounded-r-[4px] bg-accent/70"
                style={{ width: `${Math.round((m.open / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 text-right text-sm tabular">{m.open}</span>
            <span
              className={cn(
                "w-16 text-right text-xs tabular",
                m.overdue > 0 ? "font-semibold text-danger" : "text-faint",
              )}
            >
              {m.overdue > 0 ? `${m.overdue} overdue` : "—"}
            </span>
          </div>
        ))}
        {kpis.memberLoad.length === 0 && (
          <p className="text-sm text-faint">No members yet.</p>
        )}
      </div>
    </section>
  );
}
