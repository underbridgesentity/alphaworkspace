"use client";

/**
 * Time tracking surfaces (Studio): the task panel's time block and the
 * topbar chip that shows the one running timer. One timer per person,
 * starting elsewhere moves it, stopping logs whole minutes. Calm on
 * purpose: no idle nags, no decimals, no policing.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet, apiMutate } from "@/lib/client/api";
import { useFeature, useWorkspace } from "@/lib/client/workspace";
import { formatMinutes } from "@/lib/dates";
import type { RunningTimerDTO, TaskTimeDTO } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

function useNowMinute(): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return Date.now();
}

function elapsedMinutes(startedAt: string, now: number): number {
  return Math.max(1, Math.round((now - new Date(startedAt).getTime()) / 60_000));
}

function useTimeMutations(taskId?: string) {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const { toast } = useToast();
  const slug = workspace.slug;

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["ws", slug, "time-running"] });
    void qc.invalidateQueries({ queryKey: ["ws", slug, "dashboard"] });
    if (taskId) {
      void qc.invalidateQueries({ queryKey: ["ws", slug, "task-time", taskId] });
    }
  };

  const start = useMutation({
    mutationFn: (vars: { taskId: string }) =>
      apiMutate(`/api/w/${slug}/time`, {
        method: "POST",
        body: { action: "start", taskId: vars.taskId },
      }),
    onSettled: invalidate,
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Timer didn't start", {
        variant: "error",
      }),
  });

  const stop = useMutation({
    mutationFn: () =>
      apiMutate<{ minutes: number }>(`/api/w/${slug}/time`, {
        method: "POST",
        body: { action: "stop" },
      }),
    onSuccess: (res) => {
      if (!("queued" in res && res.queued)) {
        toast(`Logged ${formatMinutes(res.minutes)}`);
      }
    },
    onSettled: invalidate,
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Timer didn't stop", {
        variant: "error",
      }),
  });

  const log = useMutation({
    mutationFn: (vars: { taskId: string; minutes: number }) =>
      apiMutate(`/api/w/${slug}/time`, {
        method: "POST",
        body: { action: "log", taskId: vars.taskId, minutes: vars.minutes },
      }),
    onSettled: invalidate,
    onError: (err) =>
      toast(err instanceof Error ? err.message : "Couldn't log that", {
        variant: "error",
      }),
  });

  return { start, stop, log };
}

/* ------------------------------ task panel -------------------------------- */

export function TaskTime({ taskId }: { taskId: string }) {
  const { workspace } = useWorkspace();
  const hasTime = useFeature("time_tracking");
  const { start, stop, log } = useTimeMutations(taskId);
  const now = useNowMinute();
  const [logging, setLogging] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState("");

  const { data } = useQuery({
    queryKey: ["ws", workspace.slug, "task-time", taskId],
    queryFn: () => apiGet<{ time: TaskTimeDTO }>(`/api/w/${workspace.slug}/tasks/${taskId}/time`),
    enabled: hasTime,
    select: (d) => d.time,
  });

  if (!hasTime) return null;

  const running = data?.running ?? null;
  const total = data?.totalMinutes ?? 0;

  const submitLog = () => {
    const minutes = Number(minutesDraft);
    setLogging(false);
    setMinutesDraft("");
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440) {
      log.mutate({ taskId, minutes });
    }
  };

  return (
    <div className="px-2.5 py-2">
      <div className="flex items-center gap-2.5 text-sm">
        <span className="flex size-5 items-center justify-center">
          <Timer className="size-4 text-faint" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {running
            ? `Running · ${formatMinutes(elapsedMinutes(running.startedAt, now))}`
            : total > 0
              ? `${formatMinutes(total)} logged`
              : "No time yet"}
        </span>
        {running ? (
          <button
            onClick={() => stop.mutate()}
            className="press flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-on-accent"
          >
            <Pause className="size-3" /> Stop
          </button>
        ) : (
          <button
            onClick={() => start.mutate({ taskId })}
            aria-label="Start timer"
            className="press flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent"
          >
            <Play className="size-3" /> Start
          </button>
        )}
        {!running &&
          (logging ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={minutesDraft}
              onChange={(e) => setMinutesDraft(e.target.value)}
              onBlur={submitLog}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitLog();
                if (e.key === "Escape") setLogging(false);
              }}
              placeholder="min"
              aria-label="Minutes to log"
              className="w-16 rounded-control border border-line bg-bg px-2 py-1 text-xs outline-none focus:border-accent"
            />
          ) : (
            <button
              onClick={() => setLogging(true)}
              className="press rounded-full px-2 py-1 text-xs text-faint hover:bg-raised hover:text-ink"
            >
              + Log
            </button>
          ))}
      </div>
      {data && data.byUser.length > 0 && (
        <p className="ml-[1.875rem] mt-1 truncate text-xs text-faint">
          {data.byUser
            .map(
              (u) =>
                `${(u.user.name ?? u.user.email).split(/[\s@]/)[0]} ${formatMinutes(u.minutes)}`,
            )
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ topbar chip ------------------------------- */

export function TimerChip({ className }: { className?: string }) {
  const { workspace } = useWorkspace();
  const hasTime = useFeature("time_tracking");
  const { stop } = useTimeMutations();
  const now = useNowMinute();

  const { data } = useQuery({
    queryKey: ["ws", workspace.slug, "time-running"],
    queryFn: () => apiGet<{ running: RunningTimerDTO | null }>(`/api/w/${workspace.slug}/time`),
    enabled: hasTime,
    refetchInterval: 60_000,
    select: (d) => d.running,
  });

  if (!hasTime || !data) return null;

  return (
    <button
      onClick={() => stop.mutate()}
      title={`Stop timer on “${data.taskTitle}”`}
      aria-label={`Timer running on ${data.taskTitle}, tap to stop`}
      className={cn(
        "press flex h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent",
        className,
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span className="tabular">{formatMinutes(elapsedMinutes(data.startedAt, now))}</span>
      <span className="hidden max-w-28 truncate font-medium md:inline">
        {data.taskTitle}
      </span>
    </button>
  );
}
