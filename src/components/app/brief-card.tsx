"use client";

/**
 * The morning brief. "your three things today", shown on first open of
 * the day at the top of My Work (Team/Studio plans). Dismisses for the day.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun, X } from "lucide-react";
import { apiGet } from "@/lib/client/api";
import { useWorkspace } from "@/lib/client/workspace";
import { todaySAST } from "@/lib/dates";
import type { MorningBriefContent } from "@/lib/types";
import { useUI } from "./shell";
import { DueChip } from "./status-bits";

interface BriefResponse {
  entitled: boolean;
  brief: MorningBriefContent | null;
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
    <div className="animate-fade-up mx-4 mt-4 rounded-card bg-surface p-4 md:mx-6">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Sun className="size-4 text-accent" />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed">
          {brief.headline}
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss brief for today"
          className="press -mr-1 rounded-control p-1 text-faint hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      {brief.items.length > 0 && (
        <div className="mt-2.5 space-y-1 pl-9">
          {brief.items.map((item) => (
            <button
              key={item.taskId}
              onClick={() => openTask(item.taskId)}
              className="press flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-raised"
            >
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-xs text-faint">{item.projectName}</span>
              <DueChip dueDate={item.dueDate} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
