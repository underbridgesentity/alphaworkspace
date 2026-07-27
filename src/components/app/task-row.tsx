"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskDTO } from "@/lib/types";
import { celebrateAt, useTaskMutations } from "@/lib/client/tasks";
import { useUI } from "./shell";
import { Avatar } from "@/components/ui/avatar";
import { ChecklistChip, DueChip, PriorityFlag, railTone } from "./status-bits";

/** One task as a list row. My Work, list view, calendar overflow. */
export function TaskRow({
  task,
  showProject = false,
}: {
  task: TaskDTO;
  showProject?: boolean;
}) {
  const { openTask } = useUI();
  const { update } = useTaskMutations();
  const done = task.status === "done";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => {
        // A key pressed inside the complete toggle belongs to the toggle,
        // otherwise completing with the keyboard also opened the panel.
        if (e.target !== e.currentTarget) return;
        // Space as well as Enter: the element claims role=button, so a screen
        // reader user is told both work.
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTask(task.id);
        }
      }}
      className={cn(
        "press group flex w-full cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-left hover:bg-raised",
        // The rail is the only hue in the row. Naming the transition here
        // rather than leaning on `rail`'s own is deliberate: this rule sorts
        // after both `press` and `rail`, so all three properties animate.
        "rail transition-[box-shadow,background-color,transform] duration-(--dur-quick) ease-move",
        railTone(task),
      )}
    >
      <button
        aria-label={`Mark "${task.title}" complete`}
        aria-pressed={done}
        onClick={(e) => {
          e.stopPropagation();
          if (!done) celebrateAt(e.clientX, e.clientY);
          update.mutate({
            taskId: task.id,
            patch: { status: done ? "todo" : "done" },
          });
        }}
        // p-3 -m-3 buys a 44px target around a 20px circle without moving a
        // single pixel of layout. This is the tap people make dozens of times
        // a day, on a phone, and a near miss used to open the panel instead.
        className="group/check -m-3 flex shrink-0 items-center justify-center p-3"
      >
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border-2",
            // Spring, not ease: the circle overshoots as it fills, so the most
            // repeated gesture in the product lands with a little weight.
            "transition-[background-color,border-color,scale] duration-(--dur-base) ease-spring",
            done
              ? "scale-100 border-ok bg-ok text-bg"
              : "scale-95 border-line-strong text-transparent group-hover/check:border-ok group-hover/check:text-ok",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </button>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-body",
            done && "text-muted line-through",
          )}
        >
          {task.title}
        </span>
        {showProject && task.projectName && (
          <span className="mt-0.5 flex items-center gap-1.5 text-meta text-faint">
            <span
              className="size-2 rounded-full"
              style={{ background: task.projectColor ?? "#736D65" }}
            />
            {task.projectName}
          </span>
        )}
      </span>

      {task.labels.slice(0, 3).map((l) => (
        <span
          key={l.id}
          title={l.name}
          className="hidden size-2 shrink-0 rounded-full sm:block"
          style={{ background: l.color }}
        />
      ))}
      <ChecklistChip description={task.description} className="hidden sm:inline-flex" />
      <PriorityFlag priority={task.priority} />
      {/* min-w rather than w: "Today" stops reserving the width of "12d overdue". */}
      <DueChip
        dueDate={task.dueDate}
        done={done}
        className="min-w-16 justify-end text-right sm:min-w-20"
      />
      {task.assignee ? (
        <Avatar
          name={task.assignee.name}
          email={task.assignee.email}
          image={task.assignee.image}
          size={22}
        />
      ) : (
        <span className="size-[22px] shrink-0" />
      )}
    </div>
  );
}
