"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskDTO } from "@/lib/types";
import { celebrateAt, useTaskMutations } from "@/lib/client/tasks";
import { useUI } from "./shell";
import { Avatar } from "@/components/ui/avatar";
import { DueChip, PriorityFlag } from "./status-bits";

/** One task as a list row — My Work, list view, calendar overflow. */
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
        if (e.key === "Enter") openTask(task.id);
      }}
      className="press group flex w-full cursor-pointer items-center gap-3 rounded-card px-3 py-2.5 text-left hover:bg-raised"
    >
      <button
        aria-label={done ? "Reopen task" : "Complete task"}
        onClick={(e) => {
          e.stopPropagation();
          if (!done) celebrateAt(e.clientX, e.clientY);
          update.mutate({
            taskId: task.id,
            patch: { status: done ? "todo" : "done" },
          });
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-ok bg-ok text-bg"
            : "border-line-strong text-transparent hover:border-ok hover:text-ok",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            done && "text-muted line-through",
          )}
        >
          {task.title}
        </span>
        {showProject && task.projectName && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
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
      <PriorityFlag priority={task.priority} />
      <DueChip dueDate={task.dueDate} done={done} className="w-20 justify-end text-right sm:w-24" />
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
