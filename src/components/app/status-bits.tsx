"use client";

/**
 * Small shared task glyphs: status dot, due chip, priority flag, label pill.
 * One vocabulary everywhere, board, lists, panel, search.
 */
import { Check, Flag, ListChecks } from "lucide-react";
import { cn } from "@/lib/cn";
import { checklistProgress } from "@/lib/checklist";
import { dueLabel, isDueToday, isOverdue } from "@/lib/dates";
import type { Priority, TaskStatus } from "@/lib/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  custom: "Custom",
};

export function statusLabel(status: TaskStatus, customName?: string | null) {
  return status === "custom" && customName ? customName : STATUS_LABELS[status];
}

export function StatusDot({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  if (status === "done") {
    return (
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full bg-ok",
          className,
        )}
      >
        <Check className="size-3 text-bg" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "size-4 shrink-0 rounded-full border-2",
        status === "in_progress" ? "border-warn" : "border-line-strong",
        status === "custom" && "border-accent",
        className,
      )}
    />
  );
}

export function DueChip({
  dueDate,
  done = false,
  className,
}: {
  dueDate: string | null;
  done?: boolean;
  className?: string;
}) {
  if (!dueDate) return null;
  const overdue = !done && isOverdue(dueDate);
  const today = !done && isDueToday(dueDate);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular",
        overdue ? "font-semibold text-danger" : today ? "font-medium text-warn" : "text-faint",
        done && "text-faint line-through",
        className,
      )}
    >
      {dueLabel(dueDate)}
    </span>
  );
}

/**
 * "3/5" when the description carries a checklist, quiet until it's done,
 * then a gentle nod in ok-green. Renders nothing when there's no checklist.
 */
export function ChecklistChip({
  description,
  className,
}: {
  description: string | null | undefined;
  className?: string;
}) {
  const progress = checklistProgress(description);
  if (!progress) return null;
  const complete = progress.done === progress.total;
  return (
    <span
      title={`Checklist: ${progress.done} of ${progress.total} done`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs tabular",
        complete ? "text-ok" : "text-faint",
        className,
      )}
    >
      <ListChecks className="size-3.5" />
      {progress.done}/{progress.total}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, string | null> = {
  none: null,
  low: "text-faint",
  med: "text-warn",
  high: "text-danger",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  med: "Medium",
  high: "High",
};

export function PriorityFlag({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const style = PRIORITY_STYLES[priority];
  if (!style) return null;
  return (
    <Flag
      aria-label={`${PRIORITY_LABELS[priority]} priority`}
      className={cn("size-3.5 shrink-0", style, priority === "high" && "fill-current", className)}
    />
  );
}

export function LabelChip({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-raised px-2 py-0.5 text-xs text-muted",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
