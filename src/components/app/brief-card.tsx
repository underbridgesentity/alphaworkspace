"use client";

/**
 * The morning brief. "your three things today", shown on first open of
 * the day at the top of My Work (Team/Studio plans). Dismisses for the day.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiGet } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { isDueToday, isOverdue, todaySAST } from "@/lib/dates";
import type { BriefItem, MorningBriefContent } from "@/lib/types";
import { useUI } from "./shell";
import { DueChip } from "./status-bits";

interface BriefResponse {
  entitled: boolean;
  brief: MorningBriefContent | null;
}

/**
 * Same rail grammar as every other list in the product: state on the edge, so
 * the row's own words stay ink. The brief already carries a reason per item,
 * which is the only place "in progress" is knowable here.
 */
function railTone(item: BriefItem): string {
  if (item.reason === "overdue" || isOverdue(item.dueDate)) return "rail-overdue";
  if (item.reason === "due_today" || isDueToday(item.dueDate)) return "rail-today";
  if (item.reason === "in_progress") return "rail-active";
  return "rail-idle";
}

export function BriefCard() {
  const { workspace } = useWorkspace();
  const { openTask } = useUI();
  const [dismissed, setDismissed] = useState(true);
  const storageKey = `aw-brief-${workspace.id}-${todaySAST()}`;

  useEffect(() => {
    const id = window.setTimeout(
      () => setDismissed(Boolean(localStorage.getItem(storageKey))),
      0,
    );
    return () => window.clearTimeout(id);
  }, [storageKey]);

  const { data } = useQuery({
    queryKey: ["ws", workspace.slug, "brief", todaySAST()],
    queryFn: () => apiGet<BriefResponse>(`/api/w/${workspace.slug}/brief`),
    enabled: !dismissed,
    staleTime: 60 * 60 * 1000,
  });

  if (dismissed || !data?.entitled || !data.brief) return null;
  const brief = data.brief;

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setDismissed(true);
  };

  return (
    <div className="mx-item mt-item e2 p-item md:mx-group motion-safe:animate-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* No sun, no sparkle. A 6px accent square is the house mark for
              anything the workspace wrote for itself; the brief's whole claim
              is that it is ordinary and reliable, and a magic glyph would
              argue the opposite. 2px on a 6px square, hence the literal. */}
          <p className="flex items-center gap-tight section-head">
            <span className="size-1.5 rounded-[2px] bg-accent" aria-hidden />
            Morning brief
          </p>
          <p className="mt-hair text-lede">{brief.headline}</p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss brief for today"
          className="press -mr-1 shrink-0 rounded-control p-1 text-faint hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      {brief.items.length > 0 && (
        <div className="mt-item -mx-2 flex flex-col gap-hair">
          {brief.items.map((item) => (
            <button
              key={item.taskId}
              onClick={() => openTask(item.taskId)}
              className={cn(
                "press flex w-full items-center gap-2.5 rounded-control px-2.5 py-2.5 text-left hover:bg-raised",
                // `rail` sets the transition shorthand, so press's easing has
                // to be restated here or the tap feedback goes untransitioned.
                "transition-[transform,background-color] duration-(--dur-quick) ease-move",
                "rail",
                railTone(item),
              )}
            >
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-meta text-faint">
                {item.projectName}
              </span>
              <DueChip dueDate={item.dueDate} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
