"use client";

/**
 * Projects index, primary navigation on mobile, quick overview elsewhere.
 */
import { useState } from "react";
import Link from "next/link";
import { AudioLines, ChevronRight, FolderKanban, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/client/workspace";
import { NewProjectDialog } from "@/components/app/new-project-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const { workspace, projects } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const isAdmin = workspace.role !== "member";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 md:px-6 md:pt-7">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">Projects</h1>
        {isAdmin && (
          <Button size="sm" variant="quiet" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="mt-16 text-center animate-fade-up">
          <FolderKanban className="mx-auto size-9 text-faint" />
          <p className="mt-3 font-medium">No projects yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
            {isAdmin
              ? "A project per client engagement works well. Create the first one."
              : "When an admin creates a project, it appears here."}
          </p>
          {isAdmin && (
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Create a project
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/w/${workspace.slug}/p/${p.id}`}
              className="press rounded-card bg-surface p-4 hover:bg-raised"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: p.color }}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                </span>
                {p.lead && (
                  <span title={`Lead: ${p.lead.name ?? p.lead.email}`}>
                    <Avatar
                      name={p.lead.name}
                      email={p.lead.email}
                      image={p.lead.image}
                      size={20}
                    />
                  </span>
                )}
              </div>
              <p className="mt-1.5 flex items-center gap-2 text-sm text-muted">
                {p.clientName && <span className="truncate">{p.clientName}</span>}
                <span className="flex-1" />
                <span className="tabular">{p.openCount ?? 0} open</span>
                {(p.overdueCount ?? 0) > 0 && (
                  <span className="tabular font-semibold text-danger">
                    {p.overdueCount} overdue
                  </span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* Mobile has no sidebar; this is the way to Meetings on a phone. */}
      <Link
        href={`/w/${workspace.slug}/meetings`}
        className="press mt-4 flex items-center gap-2.5 rounded-card bg-surface p-4 hover:bg-raised md:hidden"
      >
        <AudioLines className="size-4.5 shrink-0 text-accent" />
        <span className="flex-1 font-medium">Meetings</span>
        <ChevronRight className="size-4 text-faint" />
      </Link>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
