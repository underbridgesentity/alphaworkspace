"use client";

/**
 * Month calendar of due dates. Light by design: a grid and small chips,
 * no drag choreography, tap a chip to open the task.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, todaySAST, weekStart } from "@/lib/dates";
import { useCalendar } from "@/lib/client/tasks";
import { useUI } from "./shell";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function CalendarView({ projectId }: { projectId?: string }) {
  const today = todaySAST();
  const [anchor, setAnchor] = useState(today.slice(0, 7)); // YYYY-MM
  const { openTask } = useUI();

  const { gridStart, weeks, monthLabel } = useMemo(() => {
    const first = `${anchor}-01`;
    const start = weekStart(first);
    const cells: string[] = [];
    for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
    const w: string[][] = [];
    for (let i = 0; i < 6; i++) w.push(cells.slice(i * 7, i * 7 + 7));
    const [y, m] = anchor.split("-").map(Number);
    return {
      gridStart: start,
      weeks: w,
      monthLabel: `${MONTHS[m - 1]} ${y}`,
    };
  }, [anchor]);

  const gridEnd = addDays(gridStart, 41);
  const { data: allTasks } = useCalendar(gridStart, gridEnd);

  const tasks = useMemo(
    () =>
      (allTasks ?? []).filter((t) => !projectId || t.projectId === projectId),
    [allTasks, projectId],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const shiftMonth = (delta: number) => {
    const [y, m] = anchor.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setAnchor(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  };

  return (
    <div className="px-4 pb-24 md:px-6">
      <div className="flex items-center gap-2 pb-3">
        <h2 className="flex-1 text-sm font-semibold">{monthLabel}</h2>
        <button
          onClick={() => setAnchor(today.slice(0, 7))}
          className="press rounded-control px-2 py-1 text-xs font-medium text-muted hover:bg-raised"
        >
          Today
        </button>
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="press rounded-control p-1.5 text-muted hover:bg-raised"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="press rounded-control p-1.5 text-muted hover:bg-raised"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card bg-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-surface px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-faint"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = day.startsWith(anchor);
          const isToday = day === today;
          const dayTasks = byDay.get(day) ?? [];
          return (
            <div
              key={day}
              className={cn(
                "min-h-20 bg-bg p-1.5 sm:min-h-24",
                !inMonth && "opacity-40",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full text-[11px] tabular",
                  isToday ? "bg-accent font-bold text-on-accent" : "text-faint",
                )}
              >
                {Number(day.slice(8))}
              </span>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTask(t.id)}
                    title={t.title}
                    className={cn(
                      "press block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-4",
                      t.status === "done"
                        ? "bg-raised text-faint line-through"
                        : "bg-raised text-ink hover:bg-overlay",
                    )}
                    style={
                      t.status !== "done"
                        ? { boxShadow: `inset 2px 0 0 ${t.projectColor ?? "#5B7C99"}` }
                        : undefined
                    }
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="block px-1.5 text-[10px] text-faint">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
