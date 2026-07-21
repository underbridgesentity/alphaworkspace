"use client";

/**
 * My Work, the daily driver and default landing view. Everything assigned
 * to me, overdue first, grouped so the next action is obvious.
 */
import { Suspense, useMemo } from "react";
import { CircleCheck } from "lucide-react";
import { addDays, todaySAST } from "@/lib/dates";
import type { TaskDTO } from "@/lib/types";
import { useMyWork } from "@/lib/client/tasks";
import { BriefCard } from "@/components/app/brief-card";
import { PrivateList } from "@/components/app/private-list";
import { TaskRow } from "@/components/app/task-row";
import { WelcomeCard } from "@/components/app/welcome-card";

function groupTasks(tasks: TaskDTO[]) {
  const today = todaySAST();
  const weekEnd = addDays(today, 7);
  const groups: { key: string; title: string; tone?: "danger" | "warn"; tasks: TaskDTO[] }[] = [
    { key: "overdue", title: "Overdue", tone: "danger", tasks: [] },
    { key: "today", title: "Today", tone: "warn", tasks: [] },
    { key: "week", title: "This week", tasks: [] },
    { key: "later", title: "Later", tasks: [] },
    { key: "nodate", title: "No date", tasks: [] },
  ];
  for (const t of tasks) {
    if (!t.dueDate) groups[4].tasks.push(t);
    else if (t.dueDate < today) groups[0].tasks.push(t);
    else if (t.dueDate === today) groups[1].tasks.push(t);
    else if (t.dueDate <= weekEnd) groups[2].tasks.push(t);
    else groups[3].tasks.push(t);
  }
  return groups.filter((g) => g.tasks.length > 0);
}

function MyWorkInner() {
  const { data: tasks, isLoading } = useMyWork();
  const groups = useMemo(() => groupTasks(tasks ?? []), [tasks]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Suspense>
        <WelcomeCard />
      </Suspense>
      <BriefCard />

      <div className="px-4 pb-24 pt-5 md:px-6 md:pt-7">
        <h1 className="text-xl font-semibold tracking-tight">My Work</h1>
        <p className="mt-0.5 text-sm text-muted">
          {tasks && tasks.length > 0
            ? `${tasks.length} open task${tasks.length === 1 ? "" : "s"} across your projects.`
            : "Everything assigned to you lands here, overdue first."}
        </p>

        {isLoading && (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-11" />
            ))}
          </div>
        )}

        {!isLoading && (tasks?.length ?? 0) === 0 && (
          <div className="mt-10 text-center animate-fade-up">
            <CircleCheck className="mx-auto size-9 text-ok" />
            <p className="mt-3 font-medium">Clear runway</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              Nothing on your plate. When work is assigned to you, by a
              teammate or by the mic, it shows up here, sorted by what’s due.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-6" aria-label="Assigned to me">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <h2
                className={
                  g.tone === "danger"
                    ? "px-3 text-xs font-semibold uppercase tracking-wider text-danger"
                    : g.tone === "warn"
                      ? "px-3 text-xs font-semibold uppercase tracking-wider text-warn"
                      : "px-3 text-xs font-semibold uppercase tracking-wider text-faint"
                }
              >
                {g.title}
                <span className="ml-1.5 tabular">{g.tasks.length}</span>
              </h2>
              <div className="mt-1.5">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} showProject />
                ))}
              </div>
            </section>
          ))}
        </div>

        <PrivateList />
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  return <MyWorkInner />;
}
