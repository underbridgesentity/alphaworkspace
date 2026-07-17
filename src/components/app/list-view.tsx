"use client";

import { useMemo } from "react";
import type { TaskDTO, TaskStatus } from "@/lib/types";
import { useBoard } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { TaskRow } from "./task-row";
import { statusLabel } from "./status-bits";

/** Flat, scannable list grouped by status, the board without the columns. */
export function ListView({ projectId }: { projectId: string }) {
  const { workspace } = useWorkspace();
  const { data: tasks, isLoading } = useBoard(projectId);
  const customName = workspace.settings.customColumn?.name ?? null;

  const groups = useMemo(() => {
    const order: TaskStatus[] = customName
      ? ["in_progress", "todo", "custom", "done"]
      : ["in_progress", "todo", "done"];
    const map = new Map<TaskStatus, TaskDTO[]>(order.map((s) => [s, []]));
    for (const t of tasks ?? []) map.get(t.status)?.push(t);
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return order
      .map((s) => ({ status: s, tasks: map.get(s) ?? [] }))
      .filter((g) => g.tasks.length > 0);
  }, [tasks, customName]);

  if (isLoading) {
    return (
      <div className="space-y-2 px-4 md:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-11" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="px-6 pt-12 text-center text-sm text-muted">
        No tasks yet, add one from the board, the mic, or press N.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-24 md:px-6">
      {groups.map((g) => (
        <section key={g.status} aria-label={statusLabel(g.status, customName)}>
          <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-faint">
            {statusLabel(g.status, customName)}
            <span className="ml-1.5 tabular">{g.tasks.length}</span>
          </h2>
          <div className="mt-1.5">
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
