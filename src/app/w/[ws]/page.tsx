"use client";

/**
 * My Work, the daily driver and default landing view. Everything assigned
 * to me, overdue first, grouped so the next action is obvious.
 */
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { addDays, todaySAST } from "@/lib/dates";
import type { TaskDTO } from "@/lib/types";
import { useMyWork } from "@/lib/client/tasks";
import { useWorkspace } from "@/lib/client/workspace";
import { Button } from "@/components/ui/button";
import { BriefCard } from "@/components/app/brief-card";
import { PrivateList } from "@/components/app/private-list";
import { useUI } from "@/components/app/shell";
import { TaskRow } from "@/components/app/task-row";
import { WelcomeCard } from "@/components/app/welcome-card";

function groupTasks(tasks: TaskDTO[]) {
  const today = todaySAST();
  const weekEnd = addDays(today, 7);
  const groups: { key: string; title: string; tasks: TaskDTO[] }[] = [
    { key: "overdue", title: "Overdue", tasks: [] },
    { key: "today", title: "Today", tasks: [] },
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

/**
 * The single heading idiom for a group of rows. Deliberately colourless: the
 * follow-up rail down the left edge of the rows already says overdue, so
 * tinting the label too would be the same fact twice.
 */
function GroupHead({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="flex items-baseline gap-1.5 px-3 section-head">
      {title}
      <span className="num">{count}</span>
    </h2>
  );
}

/**
 * Nothing assigned reads two very different ways, and the old copy only knew
 * one of them. An owner on a fresh workspace needs a first move; the teammate
 * who just accepted an invite needs a door into the team's work. Neither of
 * them wants congratulating for having done nothing yet.
 */
function EmptyState() {
  const { workspace, projects } = useWorkspace();
  const { openMic, openQuickAdd } = useUI();
  const base = `/w/${workspace.slug}`;
  const fresh = projects.length === 0;
  const boardHref =
    projects.length === 1 ? `${base}/p/${projects[0].id}` : `${base}/projects`;

  return (
    <div className="mt-section max-w-md motion-safe:animate-fade-up">
      <h2 className="text-title">
        {fresh ? "Nothing in here yet" : "Nothing assigned to you"}
      </h2>
      <p className="mt-hair text-muted">
        {fresh
          ? "Say it or type it. It comes back as a task with a project, an owner and a date, and the following up stops being your job."
          : "When a teammate or the mic sends you something, it lands here with the overdue work first."}
      </p>
      <div className="mt-item flex flex-wrap items-center gap-sibling">
        <Button size="sm" onClick={() => openMic()}>
          Hold the mic
        </Button>
        <Button size="sm" variant="outline" onClick={() => openQuickAdd()}>
          Type it instead
        </Button>
        {!fresh && (
          <Link
            href={boardHref}
            className="press text-meta text-muted underline decoration-line underline-offset-4 hover:text-ink"
          >
            See what the team is on
          </Link>
        )}
      </div>
    </div>
  );
}

function MyWorkInner() {
  const { data: tasks, isLoading } = useMyWork();
  const groups = useMemo(() => groupTasks(tasks ?? []), [tasks]);
  const count = tasks?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Suspense>
        <WelcomeCard />
      </Suspense>
      <BriefCard />

      <div className="px-item pb-24 pt-item md:px-group md:pt-group">
        <h1 className="text-display-sm">
          My Work
          {count > 0 && (
            <span className="ml-2 num font-normal text-faint">{count}</span>
          )}
        </h1>

        {isLoading && (
          <div className="mt-group flex flex-col gap-sibling">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10" />
            ))}
          </div>
        )}

        {!isLoading && count === 0 && <EmptyState />}

        <div className="mt-item flex flex-col gap-group" aria-label="Assigned to me">
          {groups.map((g, i) => (
            <section
              key={g.key}
              aria-label={g.title}
              /* Mount-only by construction: React keeps the same DOM node
                 across refetches, so a CSS animation declared in className
                 never replays. The stagger is capped at three steps, so no
                 group is ever held back more than 120ms on the cheap phone
                 this is built for. */
              className="motion-safe:animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 3) * 40}ms` }}
            >
              <GroupHead title={g.title} count={g.tasks.length} />
              <div className="mt-tight">
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
