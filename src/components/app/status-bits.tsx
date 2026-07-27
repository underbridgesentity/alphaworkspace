"use client";

/**
 * Small shared task glyphs: status dot, due chip, priority flag, label pill.
 * One vocabulary everywhere, board, lists, panel, search.
 *
 * Colour law: hue belongs to TIME, and it gets to say so exactly once per
 * item, on the follow-up rail down the leading edge. Everything in here reads
 * in ink and says what it means in words, so a list stays legible as text and
 * scannable as a strip of colour instead of shouting the same fact three times.
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

/**
 * THE FOLLOW-UP RAIL, one source of truth for every surface that lists work.
 * Crimson overdue, gold due today, teal in progress, hairline otherwise,
 * nothing at all once it's done. Returns the tone class only; pair it with
 * `rail` (globals.css), which paints `--rail` as a 2px inset leading edge, or
 * compose the shadow yourself when the item also carries elevation.
 *
 * Urgency outranks progress on purpose: a card that is in progress AND two
 * days late is late, and that is the thing you need to see from across a room.
 */
export function railTone(item: {
  status: TaskStatus;
  dueDate: string | null;
}): string {
  if (item.status === "done") return "rail-done";
  if (isOverdue(item.dueDate)) return "rail-overdue";
  if (isDueToday(item.dueDate)) return "rail-today";
  if (item.status === "in_progress") return "rail-active";
  return "rail-idle";
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
  // In progress is a half-filled teal ring, not an amber one: progress is
  // encoded in FORM so gold is free to mean one thing only, due today.
  if (status === "in_progress") {
    return (
      <span
        className={cn(
          "size-4 shrink-0 overflow-hidden rounded-full border-2 border-accent",
          className,
        )}
      >
        <span className="block h-full w-1/2 bg-accent" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "size-4 shrink-0 rounded-full border-2",
        status === "custom" ? "border-accent" : "border-line-strong",
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
  const urgent = !done && (isOverdue(dueDate) || isDueToday(dueDate));
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-meta tabular",
        // No crimson, no gold: the rail on the same row already carries the
        // hue, and "3d overdue" says it in words for anyone who cannot see it.
        // The chip keeps weight, which is the quietest way to lean on a number.
        urgent ? "font-medium text-ink" : "text-faint",
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
        "inline-flex shrink-0 items-center gap-1 text-meta tabular",
        // -quiet is the text-safe strength of the same green; --ok itself is a
        // mark tone and fails contrast at this size.
        complete ? "text-ok-quiet" : "text-faint",
        className,
      )}
    >
      <ListChecks className="size-3.5" />
      {progress.done}/{progress.total}
    </span>
  );
}

/**
 * Priority is form and weight, never hue. It used to spend amber on "medium"
 * and crimson on "high", which is the same two colours time pressure needs, so
 * a card could show three warm marks that all meant different things. A solid
 * ink flag outranks a muted outline outranks a faint one, and the label names
 * it for screen readers.
 */
const PRIORITY_STYLES: Record<Priority, string | null> = {
  none: null,
  low: "text-faint-mark",
  med: "text-muted",
  high: "text-ink",
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
        "inline-flex items-center gap-1.5 rounded-chip bg-raised px-2 py-0.5 text-meta text-muted",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
